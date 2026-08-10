# CinePixo 이미지 검색·스크랩·자동 부착 로직

이 문서는 Claude Code가 CinePixo의 게시글 이미지 자동화 흐름을 이해하고 유지보수하기 위한 기준 문서다.

## 1. 목표

게시글을 발행할 때 이미지가 비어 있으면, 글에 연결된 인물과 영화 정보를 사용해 관련 이미지를 검색한다. 검색 결과 중 CinePixo가 합법적으로 사용할 수 있는 이미지만 내부 저장소에 복사하고 게시글의 히어로 이미지로 부착한다.

기존 히어로 이미지가 있으면 절대 덮어쓰지 않는다. 자동화는 `image IS NULL`인 게시글을 채우는 기능이다.

## 2. 발행 흐름

```text
게시글 저장/발행 요청
        │
        ├─ image가 이미 있음 → 기존 이미지 유지
        │
        └─ image가 없음 + PUBLISHED
              │
              ├─ PostPerson을 sort 순서로 조회
              ├─ PostMovie를 sort 순서로 조회
              ├─ 인물부터 Commons/Openverse 검색
              ├─ 결과가 없으면 영화 이미지 검색
              ├─ 첫 번째 적합 후보를 다운로드
              ├─ 이미지 검증·재인코딩·EXIF 제거
              ├─ 내부 object storage에 저장
              └─ Post 이미지/크레딧/라이선스/출처 갱신
```

자동 부착의 진입점은 다음 두 곳이다.

- 관리자 게시글 생성 API: `apps/web/src/app/api/v1/admin/posts/route.ts`
- 관리자 게시글 수정/발행 API: `apps/web/src/app/api/v1/admin/posts/[id]/route.ts`
- CLI 발행 경로: `apps/web/scripts/publish-post.ts`

공통 로직은 `apps/web/src/lib/auto-post-hero.ts`의 `autoAttachPostHero()`다.

## 3. 검색 소스

공통 검색 함수는 `apps/web/src/lib/gather-sources.ts`의 `gatherPhotos()`다.

### Wikimedia Commons

- `commons.wikimedia.org/w/api.php`를 keyless로 호출한다.
- 검색어는 연결된 인물명 또는 영화명이다.
- `srnamespace=6`으로 파일 namespace만 검색한다.
- 이미지 메타데이터, 파일 페이지 URL, 작가, 라이선스, 해상도를 함께 조회한다.
- `thumburl`을 우선 사용하고 원본 파일을 무조건 다운로드하지 않는다.
- `iiurlwidth`로 적당한 rendition을 요청한다.

### Openverse

- Commons 결과가 부족할 때 보충 후보로 사용한다.
- `license_type=commercial,modification` 조건으로 상업적 이용과 수정 가능 결과를 요청한다.
- 라이선스 URL과 원본 페이지 URL이 없는 결과는 버린다.

## 4. 후보 필터링

자동 부착 후보는 아래 조건을 모두 통과해야 한다.

- HTTPS 이미지 URL
- 최소 폭 1200px
- 라이선스 이름 존재
- 라이선스가 CC BY, CC BY-SA, CC0, Public Domain 등 허용 목록에 해당
- NonCommercial/NC 제외
- NoDerivatives/ND 제외
- 출처 페이지 URL 존재
- 포스터, 로고, 앨범 커버, 지도, 도표, 스크린샷, 팬아트, 동상, 벽화, 왁스뮤지엄 이미지는 제외
- 가로로 지나치게 긴 배너나 여러 장을 붙인 montage는 제외

라이선스 필터는 `licenceAllows()`가 담당한다. 이름에 `NC`, `NonCommercial`, `ND`, `NoDerivatives`가 포함되면 거부한다.

## 5. 검색 순서와 우선순위

1. 연결된 인물들을 `PostPerson.sort` 순서대로 검색한다.
2. 첫 번째 인물의 적합한 Commons/Openverse 후보를 우선한다.
3. 인물 후보가 없으면 연결된 영화들을 `PostMovie.sort` 순서대로 검색한다.
4. 첫 번째 적합 후보만 히어로로 저장한다.
5. 후보가 없으면 게시글은 이미지 없이 발행될 수 있으며, 자동화가 권리 불명 이미지를 임의로 붙이지 않는다.

각 후보에는 내부적으로 `sourceType`을 붙인다.

| sourceType | 검색 기준 | alt 기본값 | 실패 시 다음 단계 |
|---|---|---|---|
| `PERSON` | `PostPerson`의 이름 | 인물명 | 다음 인물 검색 |
| `MOVIE` | `PostMovie`의 제목 | 영화명과 개봉연도 | 다음 영화 검색 |

현재 구현에서는 인물 후보가 영화 후보보다 먼저다. 예를 들어 Ariana Grande 글의 최신 후보는 `PERSON / Ariana Grande`로 분류하고, 파일 설명의 `Wicked: For Good` 연관성은 메타데이터와 사람이 검토할 수 있도록 별도로 기록한다. 이미지가 영화 자체를 대표해야 하는 글이라면 `PostMovie`를 연결하고, 인물 중심 글이면 `PostPerson`을 연결한다.

현재 자동 검색은 본문 문장 전체를 이미지 검색어로 사용하지 않는다. 글과 연결된 내부 Person/Movie 관계를 신뢰 경계로 사용한다. 따라서 자동 이미지가 필요하면 게시글 작성 단계에서 관련 인물이나 영화를 반드시 연결해야 한다.

## 6. 이미지 저장 파이프라인

원격 후보는 다음 순서로 내부 이미지가 된다.

```text
후보 rendition URL
  → fetchRemoteImage()
  → HTTPS·공개 DNS·redirect·크기 제한 검증
  → processImage()
  → 이미지 디코딩 검증
  → 1600px 이하 WebP 재인코딩
  → EXIF/GPS 제거
  → buildKey("posts", "webp")
  → putPublicObject()
  → Post.image에 내부 URL 저장
```

관련 구현:

- `apps/web/src/lib/media/image.ts`
- `apps/web/src/lib/media/storage.ts`

게시글에는 원격 URL을 직접 저장하지 않는다. `Post_image_is_ours` 제약 때문에 내부 저장소 URL만 허용된다.

## 7. 게시글에 기록되는 메타데이터

자동 선택 후 다음 필드를 함께 저장한다.

| 필드 | 값 |
|---|---|
| `image` | 내부 object storage URL |
| `imageAlt` | 연결된 인물명 또는 영화명/연도 |
| `imageCredit` | Commons/Openverse 작가 또는 creator |
| `imageLicense` | 원본 라이선스 이름 |
| `imageLicenseUrl` | 라이선스 설명 URL |
| `imageSourceUrl` | 원본 파일의 출처 페이지 |

라이선스가 있는 이미지는 반드시 출처 URL을 함께 저장한다. 데이터베이스의 `Post_image_license_has_source` 제약이 이를 보장한다.

## 8. SNS 캡처와 자동 검색의 분리

SNS 캡처는 검색 기반 자동 발행의 기본 경로가 아니다.

`apps/web/src/lib/social-image-import.ts`와 `apps/web/scripts/capture-social.ts`는 편집자가 명시한 공개 Instagram/YouTube/X URL을 브라우저로 캡처하는 별도 도구다.

```bash
npm run capture-social -w web -- <public-post-url> "alt text"
```

동작 방식:

- Playwright + Chromium으로 공개 페이지를 연다.
- X는 `platform.twitter.com/embed/Tweet.html?id=...` embed 화면을 사용한다.
- Instagram은 `/embed` 화면을 사용한다.
- YouTube는 `#player` 영역을 사용하고 플레이 버튼/컨트롤을 숨긴다.
- X는 프로필 아바타가 아닌 가장 큰 첨부 미디어를 선택한다.
- Instagram은 첨부 video 또는 가장 큰 이미지 영역을 선택한다.
- 로그인 벽, 비공개 게시물, 첨부 미디어가 없는 게시물은 실패한다.

SNS 캡처 이미지는 플랫폼 UI를 복사한 편집용 결과이며, 플랫폼 이미지의 재사용 권리를 자동으로 증명하지 않는다. 자동 발행 검색 로직과 혼동하지 않는다.

## 9. 운영 규칙

- 발행 전에 내부 Person/Movie 연결을 확인한다.
- 자동 검색 결과가 없으면 수동 작업 파일을 사용한다.
- 수동 이미지도 반드시 `alt`, `credit`, `license`, `licenseUrl`, `sourceUrl`을 함께 넣는다.
- 기존 히어로 교체는 자동화하지 않는다. 교체가 필요하면 `fill-post-images.ts`의 명시적 operator job을 사용한다.
- 이미지가 실제로 로드되는지 발행 후 `npm run blog-doctor -- --fetch`로 확인한다.
- 자동 검색 실패를 라이선스 없는 URL hotlink로 대체하지 않는다.

### 예외 처리

- DB에 없는 `postId`: `null` 반환, 발행 흐름을 깨지 않는다.
- 연결된 인물/영화가 없음: 후보 없음으로 처리하고 히어로를 비워 둔다.
- 검색 API timeout/429/5xx: 해당 소스는 빈 결과로 처리하고 다음 소스를 시도한다.
- 후보 메타데이터에 라이선스/출처/해상도가 없음: 후보를 거부한다.
- 원격 이미지 다운로드 실패 또는 이미지 디코딩 실패: 다음 후보를 시도한다.
- 이미지 저장 실패: 해당 후보를 실패 처리한다. 외부 URL을 Post에 저장하지 않는다.
- 중복 이벤트 사진: `eventKey`와 날짜 기준으로 제한한다.
- 기존 `Post.image`가 있음: 자동화가 실행되지 않는다.
- 비공개/로그인 페이지인 Instagram·X·YouTube: 자동 검색 후보로 사용하지 않는다.
- SNS에 첨부 이미지가 없는 텍스트 게시물: 이미지 후보로 저장하지 않는다.

## 10. 아리아나 테스트 기준

아리아나 글의 내부 관계는 `ariana-grande`, `cynthia-erivo`, `jon-m-chu`, `wicked-2024`, `wicked-for-good-2025`다.

검색 테스트에서 `Ariana Grande`는 다음과 같은 후보를 반환했다.

- `Ariana Grande promoting Wicked 1`
- 1204×892
- CC BY 3.0
- Credit: Barbie Simons
- Source: Wikimedia Commons file page

이 결과 형태가 자동 부착이 기대하는 정상 결과다. 실제 DB 발행 테스트는 `DATABASE_URL`이 설정된 환경에서 수행해야 한다.

## 11. Claude Code 작업 지시

이미지 자동화 변경 시 다음을 지킨다.

1. `auto-post-hero.ts`와 `gather-sources.ts`를 먼저 읽는다.
2. 검색 후보에 라이선스·출처가 없으면 추가하지 않는다.
3. `processImage()`와 `putPublicObject()`를 우회하지 않는다.
4. `Post.image`가 이미 있으면 덮어쓰지 않는다.
5. 새 검색 소스를 추가할 때도 동일한 HTTPS, 해상도, 라이선스, 출처 검증을 적용한다.
6. 변경 후 `npx tsc --noEmit -p apps/web/tsconfig.json`과 `npm test`를 실행한다.
7. 게시글과 이미지 관계가 바뀌면 `npm run blog-doctor -- --fetch`를 실행한다.
