// 메서드 나중에 받기: 클래스(prototype)에 이름만 먼저 걸고, 부르면 모듈을 받아 진짜 메서드로 바꾼 뒤 그대로 부름
// (창처럼 눌렀을 때만 쓰는 코드를 첫 화면 내려받기에서 빼려고). 돌려주는 값은 약속(Promise)
export function lazyMethods(proto, load, names, onFail) {
  let ready = null;
  const get = () => (ready ||= load().then((mix) => { for (const n of names) if (typeof mix[n] === 'function') proto[n] = mix[n]; }).catch((e) => { ready = null; throw e; }));
  for (const n of names) {
    proto[n] = function (...a) {
      // 받기 실패만 onFail 로, 받은 메서드 안의 오류는 그대로 올려 보냄 (오류 기록이 잡게)
      return get().then(() => proto[n].apply(this, a), (e) => { onFail?.call(this, e); console.warn('나중에 받는 코드 불러오기 실패', n, e); });
    };
  }
  return get; // 미리 받아 둘 때 부름
}
