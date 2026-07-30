export interface CountryInfo {
  code: string;
  iso: string;
  name: string;
  flag: string;
}

function toFlag(iso2: string): string {
  return [...iso2.toUpperCase()].map(c =>
    String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65),
  ).join("");
}

type Entry = [string, string, string];
const RAW: Entry[] = [
  // 3-digit codes (checked first)
  ["375","BY","Belarus"],["380","UA","Ukraina"],["381","RS","Serbia"],
  ["382","ME","Montenegro"],["385","HR","Kroasia"],["386","SI","Slovenia"],
  ["387","BA","Bosnia"],["389","MK","Makedonia"],["420","CZ","Ceko"],
  ["421","SK","Slovakia"],["423","LI","Liechtenstein"],["852","HK","Hong Kong"],
  ["853","MO","Makau"],["855","KH","Kamboja"],["856","LA","Laos"],
  ["880","BD","Bangladesh"],["886","TW","Taiwan"],["960","MV","Maladewa"],
  ["961","LB","Lebanon"],["962","JO","Yordania"],["963","SY","Suriah"],
  ["964","IQ","Irak"],["965","KW","Kuwait"],["966","SA","Arab Saudi"],
  ["967","YE","Yaman"],["968","OM","Oman"],["970","PS","Palestina"],
  ["971","AE","Uni Emirat Arab"],["972","IL","Israel"],["973","BH","Bahrain"],
  ["974","QA","Qatar"],["975","BT","Bhutan"],["976","MN","Mongolia"],
  ["977","NP","Nepal"],["992","TJ","Tajikistan"],["993","TM","Turkmenistan"],
  ["994","AZ","Azerbaijan"],["995","GE","Georgia"],["996","KG","Kyrgyzstan"],
  ["998","UZ","Uzbekistan"],["212","MA","Maroko"],["213","DZ","Aljazair"],
  ["216","TN","Tunisia"],["218","LY","Libya"],["220","GM","Gambia"],
  ["221","SN","Senegal"],["222","MR","Mauritania"],["223","ML","Mali"],
  ["224","GN","Guinea"],["225","CI","Pantai Gading"],["226","BF","Burkina Faso"],
  ["227","NE","Niger"],["228","TG","Togo"],["229","BJ","Benin"],
  ["230","MU","Mauritius"],["231","LR","Liberia"],["232","SL","Sierra Leone"],
  ["233","GH","Ghana"],["234","NG","Nigeria"],["235","TD","Chad"],
  ["236","CF","Republik Afrika Tengah"],["237","CM","Kamerun"],["238","CV","Tanjung Verde"],
  ["240","GQ","Guinea Khatulistiwa"],["241","GA","Gabon"],["242","CG","Kongo"],
  ["243","CD","Kongo DR"],["244","AO","Angola"],["245","GW","Guinea-Bissau"],
  ["246","IO","Wilayah Samudra Hindia Britania"],["247","AC","Pulau Ascension"],
  ["248","SC","Seychelles"],["249","SD","Sudan"],["250","RW","Rwanda"],
  ["251","ET","Ethiopia"],["252","SO","Somalia"],["253","DJ","Djibouti"],
  ["254","KE","Kenya"],["255","TZ","Tanzania"],["256","UG","Uganda"],
  ["257","BI","Burundi"],["258","MZ","Mozambik"],["260","ZM","Zambia"],
  ["261","MG","Madagaskar"],["262","RE","Réunion"],["263","ZW","Zimbabwe"],
  ["264","NA","Namibia"],["265","MW","Malawi"],["266","LS","Lesotho"],
  ["267","BW","Botswana"],["268","SZ","Eswatini"],["269","KM","Komoro"],
  ["290","SH","Saint Helena"],["291","ER","Eritrea"],["297","AW","Aruba"],
  ["298","FO","Kepulauan Faroe"],["299","GL","Greenland"],["350","GI","Gibraltar"],
  ["351","PT","Portugal"],["352","LU","Luksemburg"],["353","IE","Irlandia"],
  ["354","IS","Islandia"],["355","AL","Albania"],["356","MT","Malta"],
  ["357","CY","Siprus"],["358","FI","Finlandia"],["359","BG","Bulgaria"],
  ["370","LT","Lithuania"],["371","LV","Latvia"],["372","EE","Estonia"],
  ["373","MD","Moldova"],["374","AM","Armenia"],["376","AD","Andorra"],
  ["377","MC","Monako"],["378","SM","San Marino"],["389","MK","Makedonia Utara"],
  ["500","FK","Kepulauan Falkland"],["501","BZ","Belize"],["502","GT","Guatemala"],
  ["503","SV","El Salvador"],["504","HN","Honduras"],["505","NI","Nikaragua"],
  ["506","CR","Kosta Rika"],["507","PA","Panama"],["508","PM","Saint Pierre"],
  ["509","HT","Haiti"],["590","GP","Guadeloupe"],["591","BO","Bolivia"],
  ["592","GY","Guyana"],["593","EC","Ekuador"],["594","GF","Guyana Prancis"],
  ["595","PY","Paraguay"],["596","MQ","Martinique"],["597","SR","Suriname"],
  ["598","UY","Uruguay"],["599","CW","Curaçao"],["670","TL","Timor-Leste"],
  ["672","NF","Pulau Norfolk"],["673","BN","Brunei"],["674","NR","Nauru"],
  ["675","PG","Papua Nugini"],["676","TO","Tonga"],["677","SB","Kepulauan Solomon"],
  ["678","VU","Vanuatu"],["679","FJ","Fiji"],["680","PW","Palau"],
  ["681","WF","Wallis dan Futuna"],["682","CK","Kepulauan Cook"],["683","NU","Niue"],
  ["685","WS","Samoa"],["686","KI","Kiribati"],["687","NC","Kaledonia Baru"],
  ["688","TV","Tuvalu"],["689","PF","Polinesia Prancis"],["690","TK","Tokelau"],
  ["691","FM","Mikronesia"],["692","MH","Kepulauan Marshall"],["850","KP","Korea Utara"],
  ["354","IS","Islandia"],["354","IS","Islandia"],
  // 2-digit codes
  ["20","EG","Mesir"],["27","ZA","Afrika Selatan"],["30","GR","Yunani"],
  ["31","NL","Belanda"],["32","BE","Belgia"],["33","FR","Prancis"],
  ["34","ES","Spanyol"],["36","HU","Hungaria"],["39","IT","Italia"],
  ["40","RO","Rumania"],["41","CH","Swiss"],["43","AT","Austria"],
  ["44","GB","Inggris"],["45","DK","Denmark"],["46","SE","Swedia"],
  ["47","NO","Norwegia"],["48","PL","Polandia"],["49","DE","Jerman"],
  ["51","PE","Peru"],["52","MX","Meksiko"],["53","CU","Kuba"],
  ["54","AR","Argentina"],["55","BR","Brasil"],["56","CL","Chile"],
  ["57","CO","Kolombia"],["58","VE","Venezuela"],["60","MY","Malaysia"],
  ["61","AU","Australia"],["62","ID","Indonesia"],["63","PH","Filipina"],
  ["64","NZ","Selandia Baru"],["65","SG","Singapura"],["66","TH","Thailand"],
  ["81","JP","Jepang"],["82","KR","Korea Selatan"],["84","VN","Vietnam"],
  ["86","CN","China"],["90","TR","Turki"],["91","IN","India"],
  ["92","PK","Pakistan"],["93","AF","Afghanistan"],["94","LK","Sri Lanka"],
  ["95","MM","Myanmar"],["98","IR","Iran"],
  // 1-digit codes (checked last)
  ["1","US","Amerika Serikat"],["7","RU","Rusia"],
];

export const COUNTRY_MAP: Record<string, CountryInfo> = {};
for (const [code, iso, name] of RAW) {
  if (!COUNTRY_MAP[code]) {
    COUNTRY_MAP[code] = { code, iso, name, flag: toFlag(iso) };
  }
}

export function detectCountry(digits: string): CountryInfo | null {
  for (const len of [3, 2, 1]) {
    const prefix = digits.slice(0, len);
    if (COUNTRY_MAP[prefix]) return COUNTRY_MAP[prefix];
  }
  return null;
}

export interface PhoneResult {
  formatted: string;
  country: CountryInfo | null;
}

export function smartFormatPhone(raw: string): PhoneResult {
  let digits = raw.replace(/\D/g, "");
  if (!digits) return { formatted: "", country: null };

  // Local Indonesian format: starts with 0
  if (digits.startsWith("0")) {
    digits = "62" + digits.slice(1);
  }

  if (digits.length < 7) return { formatted: "", country: null };

  const country = detectCountry(digits);
  return { formatted: "+" + digits, country };
}
