# 외부 무료 에셋 (CC0)

게임에 들어간 외부 3D 에셋은 모두 **CC0 1.0 (퍼블릭 도메인)** 입니다.
상업적 사용·수정·재배포에 제한이 없고 출처 표기 의무도 없지만, 감사의 뜻으로 아래에 기록합니다.

| 파일 (public/models) | 내용 | 원작자 / 팩 | 라이선스 |
|---|---|---|---|
| `q_farm.glb` | 헛간, 사일로, 닭장, 우물, 물탱크, 트랙터 창고, 풍차 2종, 울타리 | Quaternius — Farm Buildings Pack | CC0 1.0 |
| `q_nature.glb` | 나무(일반·소나무·자작·버드·단풍·설경), 덤불, 바위, 풀, 그루터기, 통나무, 연잎 | Quaternius — Ultimate Nature Pack | CC0 1.0 |
| `q_cow.glb`, `q_horse.glb`, `q_donkey.glb`, `q_alpaca.glb`, `q_shiba.glb` | 뼈대 애니메이션 동물 (걷기·대기·풀 뜯기·두리번·달리기) | Quaternius — Ultimate Animated Animal Pack | CC0 1.0 |
| `q_wolf.glb`, `q_fox.glb` | 늑대·여우 (걷기·달리기·두리번·으르렁) | Quaternius — Ultimate Animated Animal Pack | CC0 1.0 |
| `q_sheep.glb` | 양 (대기 + 같은 뼈대의 농장 팩 소에서 옮겨 온 걷기) | Quaternius — Farm Animal Pack | CC0 1.0 |

- 원본: <https://quaternius.com> (Farm Buildings / Ultimate Nature / Ultimate Animated Animal Pack)
- 라이선스 전문: <https://creativecommons.org/publicdomain/zero/1.0/>

닭(`hen.glb`)·까마귀(`crow.glb`)·벌통(`beehive.glb`)은 같은 저폴리 결로 이 저장소에서 직접 만든 모델입니다(`blender/build_environment.py` 의 `hen()`).
유니코 캐릭터(코드 생성), 논·스마트팜·장터·트랙터 등 나머지 모델은 이 저장소의 Blender 스크립트(`blender/build_environment.py`)로 만든 것입니다.

## 변환 과정 (다시 만들기)

원본 FBX/glTF 는 저장소에 넣지 않습니다. 아래 순서로 다시 만들 수 있습니다.

1. Quaternius 사이트에서 세 팩을 받아 한 폴더에 정리
   - `<원본>/bld/*.fbx` ← Farm Buildings Pack 의 FBX
   - `<원본>/nature/*.fbx` ← Ultimate Nature Pack 의 FBX
   - `<애니>/*.gltf` ← Ultimate Animated Animal Pack 의 glTF (Cow, Horse, Donkey, Alpaca, ShibaInu)
   - `<원본>/farm/Sheep.fbx`, `<원본>/farm/Cow.fbx` ← Farm Animal Pack (OpenGameArt 의 "LowPoly Animated Farm Animal Pack" 에도 같은 CC0 파일)
2. FBX → GLB 묶음 (Blender bpy, 메시 결합·바닥 정렬·풍차 날개 분리)
   ```bash
   python3 -I blender/import_cc0.py <원본> <중간 폴더>
   ```
3. 색·재질 이름을 게임 팔레트로 맞추고 애니메이션 정리, meshopt 압축 → `public/models/q_*.glb`
   ```bash
   node scripts/optimize-cc0.mjs <중간 폴더> <애니>
   ```

재질 이름은 `src/game/surface.js` 의 `kindOf()` 규칙에 맞춰 바뀌므로(예: `LightRed` → `barn_red`, `Green` → `leaf`),
게임 안에서 나무결·지붕·잎 흔들림 같은 절차적 질감이 그대로 적용됩니다.
