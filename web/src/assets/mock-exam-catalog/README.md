# 모의고사 카탈로그 이미지

`web/src/assets/mock-exam-catalog/` 아래에 아래 **파일명(확장자 제외) = DB `slug`** 로 저장하세요.

| slug (파일명)      | 표시 제목        |
| ------------------ | ---------------- |
| `igam-korean`      | 이감국어         |
| `sangsang-korean`  | 상상국어         |
| `darchive-korean`  | D.ARCHIVE 국어   |
| `darchive-english` | D.ARCHIVE 영어   |
| `darchive-social`  | D.ARCHIVE 사탐   |

확장자는 **`.jpg`** 또는 **`.jpeg`** 만 사용합니다 (소문자 권장).

예: `igam-korean.jpg`

이미지를 넣은 뒤 **개발 서버를 재시작**하면 Vite glob이 새 파일을 인식합니다.
