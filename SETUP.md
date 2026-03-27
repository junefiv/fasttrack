# 새 PC에서 클론·풀 후 설정 (FAST TRACK)

Git으로 받은 뒤 **한 번만** 또는 **`package.json`이 바뀐 뒤** 아래를 진행하면 됩니다.

## 필요한 것

- **Node.js** — LTS 권장 (예: 20.x 이상). [nodejs.org](https://nodejs.org/)  
- **npm** (Node에 포함)  
- **Git**

선택: Supabase를 로컬에서 띄울 때만 [Supabase CLI](https://supabase.com/docs/guides/cli).

---

## 1. 저장소 받기

```bash
git clone <저장소 URL>
cd FASTTRACK
```

이미 클론한 폴더라면:

```bash
git pull
```

---

## 2. 프론트엔드 의존성 설치 (`web`)

저장소 루트가 `FASTTRACK`일 때:

```bash
cd web
npm install
```

- **`node_modules`** 는 Git에 없으므로 **clone/pull 할 때마다 이 PC에 없으면** `npm install` 필요합니다.  
- **`package-lock.json`** 이 같이 올라가 있다면 `npm ci` 로 재현성 있게 설치할 수도 있습니다 (`node_modules` 삭제 후).

---

## 3. 환경 변수 (Git에 없음 → 매 PC에서 새로 만들기)

`web/.gitignore` 에 **`*.local`** 이 있어 **`web/.env.local`** 은 커밋되지 않습니다.  
따라서 **다른 PC에서는 반드시 다시 만들어야** 합니다.

1. `web/.env.example` 을 복사해 **`web/.env.local`** 로 저장합니다.  
2. 아래 값을 팀/프로젝트에서 안전하게 전달받은 내용으로 채웁니다.

| 변수 | 설명 |
|------|------|
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon(public) 키 |
| `VITE_GEMINI_API_KEY` | Gemini API (브라우저에 노출됨 — 운영에서는 백엔드 프록시 권장) |
| `VITE_GEMINI_MODEL` | 선택. 미입력 시 코드 기본값 사용 |

`.env.local` 을 만들지 않으면 빌드/실행은 되더라도 **Supabase·AI 기능이 동작하지 않을 수** 있습니다.

---

## 4. 개발 서버 실행

```bash
cd web
npm run dev
```

브라우저에서 터미널에 나온 주소(보통 `http://localhost:5173`)로 접속합니다.

기타 스크립트:

| 명령 | 용도 |
|------|------|
| `npm run build` | 프로덕션 빌드 (`web/dist`) |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm run lint` | ESLint |

---

## 5. Gitignore로 인해 레포에 없는 것들 (정리)

`web/.gitignore` 기준으로 로컬에만 있는 대표 항목입니다.

| 항목 | 설명 |
|------|------|
| `node_modules/` | `npm install` 로 생성 |
| `dist/` | `npm run build` 로 생성 |
| `*.local` | 예: **`.env.local`** — 비밀·환경별 설정 |
| `.vscode/` (일부 예외 제외) | 개인 VS Code 설정 |
| 로그 파일 등 | `*.log` 등 |

**비밀키·API 키는 `.env.local`에만 두고 Git에 올리지 마세요.**

---

## 6. 데이터베이스 (Supabase)

`supabase/migrations/` 아래 SQL 마이그레이션이 있습니다.  
**원격 Supabase 프로젝트**를 쓰는 경우, 팀에서 정한 방식으로 마이그레이션을 적용해야 합니다 (예: Supabase Dashboard SQL, 또는 CLI `db push` 등).

프론트의 `VITE_SUPABASE_*` 가 가리키는 **프로젝트와 DB 스키마가 맞는지** 확인하세요. DB만 비어 있거나 RLS/스키마가 다르면 앱은 뜨지만 데이터/API가 실패할 수 있습니다.

---

## 7. 네트워크 (PDF 뷰어)

`react-pdf`용 PDF.js **Worker**를 **CDN(jsDelivr)** 에서 불러오도록 설정되어 있습니다.  
해당 PC에서 **`cdn.jsdelivr.net` 접근이 막혀 있으면** 인앱 PDF 보기가 실패할 수 있습니다. (필요 시 방화벽/프록시 또는 Worker를 로컬 번들로 바꾸는 방식 검토)

---

## Pull 이후 체크리스트 (요약)

1. `git pull`  
2. `cd web && npm install` (의존성 변경 시 필수)  
3. `web/.env.local` 존재·값 확인 (없으면 `.env.example` 복사 후 입력)  
4. `npm run dev`

문제가 있으면 `npm run build` 로 타입/빌드 오류부터 확인하는 것을 권장합니다.
