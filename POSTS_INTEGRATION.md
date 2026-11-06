# 게시판 페이지 연동 가이드

현재 `posts.html`은 브라우저의 **localStorage를 사용하는 시연용 페이지**입니다.

현재 저장소에는 Firebase 설정, Firestore 보안 규칙, `chat.html` 파일이 없습니다.

예시 게시글에는 임의로 생성한 ID가 사용되므로 실제 채팅 상대를 식별할 수 없습니다.

또한 `local-demo-user`를 이용한 작성자 권한 확인은 UI 시연용 기능일 뿐이며, 실제 사용자 간의 보안을 보장하지 않습니다.

## 1. Firebase 및 사용자 인증 연동

팀에서 Firebase 설정과 로그인 기능을 제공하면 Firestore에 `posts` 컬렉션을 사용합니다.

각 게시글의 문서 ID를 게시글 ID로 사용합니다.

### 게시글 데이터 구조

| 필드         | 자료형              | 설명                                                           |
| ------------ | ------------------- | -------------------------------------------------------------- |
| `authorId`   | string              | Firebase Authentication의 `currentUser.uid`. 작성 후 변경 불가 |
| `authorName` | string              | 화면에 표시할 작성자 이름. 권한 확인에는 사용하지 않음         |
| `title`      | string              | 게시글 제목. 필수 입력, 최대 60자                              |
| `body`       | string              | 게시글 내용. 필수 입력, 최대 1500자                            |
| `dorm`       | string              | 페이지에서 제공하는 11개 생활관 중 하나                        |
| `status`     | string              | 모집 상태: `open` 또는 `closed`                                |
| `typeCode`   | string              | 선택 사항. `MCQH-I`와 같은 성향 검사 유형 코드                 |
| `createdAt`  | timestamp           | 서버 기준 작성 시간. 변경 불가                                 |
| `updatedAt`  | timestamp 또는 null | 게시글 수정 시 서버 기준 수정 시간                             |

게시글은 `createdAt`을 기준으로 최신순으로 표시합니다.

초기 버전에서는 불러온 게시글을 브라우저에서 검색 및 필터링할 수 있습니다. 서버 기반 페이지네이션이나 전체 텍스트 검색은 추후 별도로 결정해야 합니다.

### 작성자 권한 및 보안

게시글 작성 시 Firebase Authentication에서 제공하는 실제 사용자 UID를 사용해야 합니다.

예시 게시글은 공용 Firestore 데이터베이스로 이전하지 않습니다.

현재의 시연용 작성자 확인 로직은 로그인한 사용자의 UID를 기준으로 변경해야 합니다.

또한 같은 권한 확인을 Firestore 보안 규칙에서도 적용해야 합니다.

다음은 기본적인 보안 규칙의 예시입니다.

```javascript
match /posts/{postId} {
  allow read: if true;
  allow create: if request.auth != null
    && request.resource.data.authorId == request.auth.uid;
  allow update: if request.auth != null
    && resource.data.authorId == request.auth.uid
    && request.resource.data.authorId == resource.data.authorId
    && request.resource.data.createdAt == resource.data.createdAt;
  allow delete: if request.auth != null
    && resource.data.authorId == request.auth.uid;
}
```

**주의:** 위 규칙은 연동을 위한 제안이며, 실제 배포된 규칙이 아닙니다.

Firebase 및 Firestore 담당자는 최종 데이터 구조에 맞게 필드 검증을 추가하고, 보안 규칙을 확인한 뒤 배포해야 합니다.

## 2. 채팅 페이지 연동

다른 사용자가 작성한 게시글이 `모집 중(open)` 상태일 경우, **채팅하기** 버튼을 통해 채팅 페이지로 이동하도록 설계했습니다.

이동할 URL 형식은 다음과 같습니다.

`chat.html?with=AUTHOR_UID&post=POST_ID`

### URL 파라미터

- `with`: 게시글 작성자의 Firebase Authentication UID
- `post`: 해당 게시글의 Firestore 문서 ID

두 값은 URL에 사용할 수 있도록 인코딩됩니다.

### 채팅 페이지에서 구현해야 할 기능

채팅 페이지 담당자는 다음 사항을 구현해야 합니다.

1. URL에서 `with`와 `post` 파라미터를 읽습니다.
2. 사용자의 로그인 상태를 확인합니다.
3. Firestore의 `posts/{POST_ID}` 문서를 불러옵니다.
4. 게시글의 `authorId`가 `with` 값과 일치하는지 확인합니다.
5. 채팅 화면에 원본 게시글의 정보를 표시합니다.
    - 제목 (`title`)
    - 생활관 (`dorm`)
    - 모집 상태 (`status`)
6. 게시글이 삭제되었거나 존재하지 않는 경우를 처리합니다.
7. 채팅 화면에 진입한 후 모집 상태가 변경된 경우도 처리합니다.

채팅 페이지로 이동하는 것만으로 메시지가 자동 전송되어서는 안 됩니다.

### 첫 메시지 추천 문구

사용자가 직접 선택하여 보낼 수 있는 첫 메시지 예시입니다.

> 안녕하세요! 룸메이트 구하는 게시글 보고 연락드렸어요. 아직 구하고 계신가요?

현재 게시판 페이지에서는 이동 전에 `chat.html` 파일에 접근할 수 있는지 확인합니다.

채팅 페이지가 아직 준비되지 않았다면 안내 메시지를 표시합니다.

**실제 채팅 기능과 게시글 미리보기 구현은 채팅 페이지 담당자의 작업 범위입니다.**

## 3. 성향 검사 페이지 연동

현재 성향 검사 페이지에서는 동일한 11개 생활관 목록을 사용하고 있습니다.

성향 검사 결과는 다음과 같은 형식의 코드로 표현됩니다.

`MCQH-I`

설문 페이지에서는 응답 및 생활관 정보를 `roommate-survey`에 저장하지만, 계산된 최종 성향 유형 코드는 별도로 저장하지 않습니다.

### 현재 게시판의 지원 기능

게시글 작성 시 사용자가 성향 유형 코드를 직접 입력할 수 있습니다.

또한 다음과 같은 URL 파라미터를 지원합니다.

`posts.html?type=MCQH-I`

유효한 유형 코드가 전달되면 새 게시글 작성 화면의 성향 코드 입력란에 자동으로 입력됩니다.

잘못된 형식의 코드는 적용되지 않습니다.

성향 검사 페이지 담당자와 연동 방식이 확정되면 설문 결과 페이지에서 위 URL로 이동하는 버튼을 추가할 수 있습니다.

**현재 게시판 연동을 위해 설문 문항이나 검사 로직을 수정할 필요는 없습니다.**

# Posts page integration contract

`posts.html` currently runs as a **browser localStorage demo**. The checkout has no
Firebase app configuration, Firestore rules, or `chat.html`. Sample posts have
invented IDs and are never valid chat recipients. The demo's `local-demo-user`
ownership check is only a UI simulation; it provides no security between users.

## Firestore and Authentication

When the team provides a Firebase configuration and sign-in flow, use a `posts`
collection. Each document ID is the post ID. Document fields are:

| Field        | Type              | Meaning                                              |
| ------------ | ----------------- | ---------------------------------------------------- |
| `authorId`   | string            | Firebase Authentication `currentUser.uid`; immutable |
| `authorName` | string            | Display label, never an authorization source         |
| `title`      | string            | Required, at most 60 characters                      |
| `body`       | string            | Required, at most 1500 characters                    |
| `dorm`       | string            | One of the 11 dormitory labels on the page           |
| `status`     | string            | `open` or `closed`                                   |
| `typeCode`   | string            | Optional five-axis code such as `MCQH-I`             |
| `createdAt`  | timestamp         | Server timestamp, immutable                          |
| `updatedAt`  | timestamp or null | Server timestamp on edits                            |

Read posts newest first by `createdAt`. Search can initially filter loaded posts
client-side; server pagination or full-text search needs a separate decision.
On write, use Firebase Auth's actual UID. Never migrate sample posts to shared
Firestore. Replace the demo ownership check with the signed-in UID and enforce
the same check in Firestore security rules. Proposed minimum rule shape (adapt
field validation to the final schema):

```js
match /posts/{postId} {
  allow read: if true;
  allow create: if request.auth != null
    && request.resource.data.authorId == request.auth.uid;
  allow update: if request.auth != null
    && resource.data.authorId == request.auth.uid
    && request.resource.data.authorId == resource.data.authorId
    && request.resource.data.createdAt == resource.data.createdAt;
  allow delete: if request.auth != null
    && resource.data.authorId == request.auth.uid;
}
```

These rules are an integration proposal, **not deployed rules**. The team's
Firestore rules owner must validate the complete field schema and deploy them
with the Firebase integration before shared writes are enabled.

## Chat handoff

For a different author's open post, `posts.html` navigates to:

`chat.html?with=AUTHOR_UID&post=POST_ID`

Both values are URL encoded. `AUTHOR_UID` must be the post document's
`authorId`, which must come from Firebase Authentication. `POST_ID` must be the
Firestore document ID. The chat page should read both query parameters, verify
the user is signed in, load `posts/{POST_ID}`, verify its `authorId` matches
`with`, and show a preview with `title`, `dorm`, and `status`. It should handle
missing or deleted posts and a status change after the link was opened. It
should not send a message on navigation. Suggested first message:

> 안녕하세요! 룸메이트 구하는 게시글 보고 연락드렸어요. 아직 구하고 계신가요?

The posts page checks that `chat.html` can be fetched before navigating and
shows an unavailable message if it cannot. The chat developer owns the actual
conversation and preview implementation.

## Survey handoff

The survey branch uses the same 11 dormitory labels and computes codes in the
form `MCQH-I`. It stores answers and dormitory info under `roommate-survey`, but
does not persist the computed result code. This page keeps manual type entry.
It also accepts `posts.html?type=MCQH-I` to prefill a new post; only valid codes
are accepted. The survey developer can add a link with that query parameter
after agreeing on the flow. No questionnaire changes are required here.
