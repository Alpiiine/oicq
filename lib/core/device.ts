import {randomBytes} from "crypto"
import {formatTime, md5, randomString} from "./constants"
import axios from "axios";
import {aesDecrypt, aesEncrypt, encryptPKCS1} from "./algo";


function generateImei() {
	let imei = `86${randomString(12,'0123456789')}`

	function calcSP(imei: string) {
		let sum = 0
		for (let i = 0; i < imei.length; ++i) {
			if (i % 2) {
				let j = parseInt(imei[i]) * 2
				sum += j % 10 + Math.floor(j / 10)
			} else {
				sum += parseInt(imei[i])
			}
		}
		return (100 - sum) % 10
	}

	return imei + calcSP(imei)
}

/** 生成短设备信息 */
export function generateShortDevice() {
	const randstr = (length: number, num: boolean = false) => {
		const map = num ? '0123456789' : '0123456789abcdef'
		return randomString(length, map)
	}
	return {
		"--begin--": "该设备为随机生成，丢失后不能得到原先配置",
		product: `ILPP-${randstr(5).toUpperCase()}`,
		device: `${randstr(5).toUpperCase()}`,
		board: `${randstr(5).toUpperCase()}`,
		brand: `${randstr(4).toUpperCase()}`,
		model: `ILPP ${randstr(4).toUpperCase()}`,
		wifi_ssid: `HUAWEI-${randstr(7)}`,
		bootloader: `U-boot`,
		android_id: `IL.${randstr(7, true)}.${randstr(4, true)}`,
		boot_id: `${randstr(8)}-${randstr(4)}-${randstr(4)}-${randstr(4)}-${randstr(12,)}`,
		proc_version: `Linux version 5.10.101-android12-${randstr(8)}`,
		mac_address: `2D:${randstr(2).toUpperCase()}:${randstr(2).toUpperCase()}:${randstr(2,).toUpperCase()}:${randstr(2).toUpperCase()}:${randstr(2).toUpperCase()}`,
		ip_address: `192.168.${randstr(2, true)}.${randstr(2, true)}`,
		imei: `${generateImei()}`,
		incremental: `${randstr(10).toUpperCase()}`,
		"--end--": "修改后可能需要重新验证设备。"
	}
}


/** 生成完整设备信息 */
export function generateFullDevice(apk: Apk, d?: ShortDevice) {
	if (!d) d = generateShortDevice()
	return {
		display: d.android_id,
		product: d.product,
		device: d.device,
		board: d.board,
		brand: d.brand,
		model: d.model,
		bootloader: d.bootloader,
		fingerprint: `${d.brand}/${d.product}/${d.device}:10/${d.android_id}/${d.incremental}:user/release-keys`,
		boot_id: d.boot_id,
		proc_version: d.proc_version,
		baseband: "",
		sim: "T-Mobile",
		os_type: "android",
		mac_address: d.mac_address,
		ip_address: d.ip_address,
		wifi_bssid: d.mac_address,
		wifi_ssid: d.wifi_ssid,
		imei: d.imei,
		android_id: d.android_id,
		apn: "wifi",
		version: {
			incremental: d.incremental,
			release: "10",
			codename: "REL",
			sdk: 29,
		},
		imsi: randomBytes(16),
		guid: md5(Buffer.concat([Buffer.from(d.imei), Buffer.from(d.mac_address)])),
	}
}

export type ShortDevice = ReturnType<typeof generateShortDevice>

export interface Device extends ReturnType<typeof generateFullDevice> {
	qImei16?: string
	qImei36?: string
}

export class Device {
	private secret = 'ZdJqM15EeO2zWc08';
	private publicKey = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDEIxgwoutfwoJxcGQeedgP7FG9
qaIuS0qzfR8gWkrkTZKM2iWHn2ajQpBRZjMSoSf6+KJGvar2ORhBfpDXyVtZCKpq
LQ+FLkpncClKVIrBwv6PHyUvuCb0rIarmgDnzkfQAqVufEtR64iazGDKatvJ9y6B
9NMbHddGSAUmRTCrHQIDAQAB
-----END PUBLIC KEY-----`;

	constructor(private apk: Apk, d?: ShortDevice) {
		if (!d) d = generateShortDevice()
		Object.assign(this, generateFullDevice(apk, d))
	}

	async getQIMEI() {
		if (this.apk.app_key === "") {
			return;
		}
		const k = randomString(16);
		const key = encryptPKCS1(this.publicKey, k);
		const time = Date.now();
		const nonce = randomString(16);
		const payload = this.genRandomPayloadByDevice();
		const params = aesEncrypt(JSON.stringify(payload), k).toString('base64');
		try {const {data} = await axios.post<{ data: string, code: number }>(
			"https://snowflake.qq.com/ola/android", {
				key,
				params,
				time, nonce,
				sign: md5(key + params + time + nonce + this.secret).toString("hex"),
				extra: ''
			}, {
				headers: {
					'User-Agent': `Dalvik/2.1.0 (Linux; U; Android ${this.version.release}; PCRT00 Build/N2G48H)`,
					'Content-Type': "application/json"
				}
			});
			if (data?.code !== 0) {
				return;
			}
			const {q16, q36} = JSON.parse(aesDecrypt(data.data, k))
			this.qImei16 = q16
			this.qImei36 = q36
		} catch{
		}
	}

	genRandomPayloadByDevice() {
		const now = new Date();
		const fixedRand = (max = 1, min = 0) => {
			if (max < min) [max, min] = [min, max]
			const diff = max - min
			return Math.floor(Math.random() * diff) + min
		};
		const reserved = {
			"harmony": "0",
			"clone": Math.random() > 0.5 ? "1" : "0",
			"containe": "",
			"kelong": Math.random() > 0.5 ? "1" : "0",
			"uptimes": formatTime(new Date()),
			"multiUser": Math.random() > 0.5 ? "1" : "0",
			"bod": this.board,
			"brd": this.brand,
			"dv": this.device,
			"firstLevel": "",
			"manufact": this.brand,
			"name": this.model,
			"host": "se.infra",
			"kernel": this.fingerprint
		};
		const timeMonth = `${formatTime(new Date(),'yyyy-MM')}-01`;
		const staticRand1 = fixedRand(10000, 1000)
		const staticRand2 = fixedRand(100)
		const staticTime = `${new Date().getFullYear() - 1}-${String(fixedRand(13, 1)).padStart(2, '0')}-${String(fixedRand(29, 1)).padStart(2, '0')}`
		let beaconIdArr = new Array(40).fill(1).map((_, i) => {
			let idx: number = i + 1
			if (idx === 3) return `k3:${''.padStart(16, '0')}`
			if (idx === 4) return `K4:${this.android_id}`
			if (idx === 9) return `k9:${this.boot_id}`
			if (idx === 19) return `k${idx}:${fixedRand(100000, 1000000)}`
			if ([1, 13, 14, 17, 18, 21, 25, 26, 29, 30, 33, 34, 37, 38].includes(idx)) {
				if ([25, 26, 29, 30].includes(idx)) return `k${idx}:${timeMonth}00${staticRand1}.${String(idx === 25 ? staticRand2 : staticRand2 + 1).padStart(2, '0')}0000000`
				return `k${idx}:${timeMonth}00${fixedRand(10000, 1000)}.${fixedRand(100).toString().padStart(2, '0')}0000000`
			}
			if ([16, 20, 28, 36].includes(idx)) return `k${idx}:${fixedRand(100, 10)}`
			if ([10, 11, 12, 15, 24, 32, 35, 39, 40].includes(idx)) return `k${idx}:${fixedRand(10)}`
			if ([5, 6, 7].includes(idx)) return `k${idx}:${fixedRand(10000000, 1000000)}`
			if ([23, 27, 31]) return `k${idx}:${fixedRand(10000, 1000)}`
			if ([22, 2].includes(idx)) return `k${staticTime}${fixedRand(1000000, 100000)}.${fixedRand(1000000000, 100000000)}`
			return `k${i}:${fixedRand(10, 0)}`
		}).filter(Boolean)
		return {
			"androidId": this.android_id,
			"platformId": 1,
			"appKey": this.apk.app_key,
			"appVersion": this.apk.version,
			"beaconIdSrc": beaconIdArr.join(';'),
			"brand": this.brand,
			"channelId": "2017",
			"cid": "",
			"imei": this.imei,
			"imsi": this.imsi.toString("hex"),
			"mac": this.mac_address,
			"model": this.model,
			"networkType": "unknown",
			"oaid": "",
			"osVersion": `Android ${this.version.release},level ${this.version.sdk}`,
			"qimei": "",
			"qimei36": "",
			"sdkVersion": "1.2.13.6",
			"targetSdkVersion": "26",
			"audit": "",
			"userId": "{}",
			"packageId": this.apk.id,
			"deviceType": this.display,
			"sdkName": "",
			"reserved": JSON.stringify(reserved),
		}
	}
}

/** 支持的登录设备平台 */
export enum Platform {
	Android = 1,
	aPad = 2,
	Watch = 3,
	iMac = 4,
	iPad = 5
}

export type Apk = typeof mobile
const mobile = {
	id: "com.tencent.mobileqq",
	app_key: '0S200MNJT807V3GE',
	name: "A8.9.33.10335",
	version: "8.9.33.10335",
	ver: "8.9.33",
	sign: Buffer.from([0xA6, 0xB7, 0x45, 0xBF, 0x24, 0xA2, 0xC2, 0x77, 0x52, 0x77, 0x16, 0xF6, 0xF3, 0x6E, 0xB6, 0x8D]),
	buildtime: 1673599898,
	appid: 16,
	subid: 537151682,
	bitmap: 150470524,
	main_sig_map: 16724722,
	sub_sig_map: 0x10400,
	sdkver: "6.0.0.2534",
	display: "Android",
	ssover: 19,
}
const watch: Apk = {
	id: "com.tencent.qqlite",
	app_key: '0S200MNJT807V3GE',
	name: "A2.0.5",
	version: "2.0.5",
	ver: "2.0.5",
	sign: Buffer.from([166, 183, 69, 191, 36, 162, 194, 119, 82, 119, 22, 246, 243, 110, 182, 141]),
	buildtime: 1559564731,
	appid: 16,
	subid: 537064446,
	bitmap: 16252796,
	main_sig_map: 16724722,
	sub_sig_map: 0x10400,
	sdkver: "6.0.0.2534",
	display: "Watch",
	ssover: 5
}
const hd: Apk = {
	id: "com.tencent.minihd.qq",
	app_key: '0S200MNJT807V3GE',
	name: "A5.9.3.3468",
	version: "5.9.3.3468",
	ver: "5.9.3",
	sign: Buffer.from([0xAA, 0x39, 0x78, 0xF4, 0x1F, 0xD9, 0x6F, 0xF9, 0x91, 0x4A, 0x66, 0x9E, 0x18, 0x64, 0x74, 0xC7]),
	buildtime: 1637427966,
	appid: 16,
	subid: 537128930,
	bitmap: 150470524,
	main_sig_map: 1970400,
	sub_sig_map: 66560,
	sdkver: "6.0.0.2487",
	display: "iMac",
	ssover: 12
}

const apklist: { [platform in Platform]: Apk } = {
	[Platform.Android]: mobile,
	[Platform.aPad]: {
		...mobile,
		subid: 537151218,
		display: 'aPad'
	},
	[Platform.Watch]: watch,
	[Platform.iMac]: {...hd},
	[Platform.iPad]: {
		...mobile,
		subid: 537151363,
		sign: hd.sign,
		name:'A8.9.33.614',
		version: 'A8.9.33.614',
		display: 'iPad'
	},
}

export function getApkInfo(p: Platform): Apk {
	return apklist[p] || apklist[Platform.Android]
}