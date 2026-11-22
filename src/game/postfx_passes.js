// 무거운 화면 효과 패스 (GTAO·블룸·SMAA·틸트시프트): 쓰는 품질(보통·높음)에서만 따로 받음
// → 후처리를 끈 저사양 폰은 이 코드(SMAA 검색 이미지 포함)를 내려받지도 않음 (postfx.js 가 import() 로 부름)
export { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
export { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
export { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
export { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
export { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';
