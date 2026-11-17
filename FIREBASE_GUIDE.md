# Firebase 연동 가이드 (팀원용)

로그인과 DB 연결은 `firebase.js`에 모아두었습니다. 각 페이지에서는 **localStorage 저장 부분만** 아래 함수로 바꾸면 됩니다. 화면 그리는 코드는 그대로 두면 돼요.

- 로그인: 학번 + 비밀번호 (`index.html`)
- DB: Firestore. 보안 규칙은 `firestore.rules`이고 이미 게시되어 있음
- 배포: Cloudflare Pages (`main`에 push하면 자동 배포)

## 0. 공통 준비

### 실행 방법
`type="module"` 스크립트는 파일을 더블클릭해서 열면(`file://`) 동작하지 않습니다.
VS Code **Live Server**로 열거나, Cloudflare 미리보기 주소에서 확인하세요.

### 스크립트 태그 바꾸기
각 페이지 맨 아래의 `<script>`를 `<script type="module">`로 바꾸고, 맨 위에 필요한 함수를 import 합니다.

```html
<script type="module">
  import { requireLogin, listPosts } from "./firebase.js";

  const user = await requireLogin(); // 로그인 안 했으면 index.html로 갔다가 로그인 후 다시 돌아옴
  // user.uid 가 내 고유 ID
  ...기존 코드...
</script>
```

> 지금 세 페이지 모두 `onclick="..."` 같은 인라인 이벤트를 쓰지 않아서 module로 바꿔도 문제없습니다.

### 날짜 필드 주의
Firestore에서 읽은 `createdAt`, `updatedAt`은 문자열이 아니라 **Timestamp 객체**입니다.

```js
const date = post.createdAt?.toDate?.() ?? new Date(); // Date로 바꾸기
```

저장 직후에는 잠깐 `null`일 수 있으니 `?.`로 처리하세요.

### 오류가 날 때
- `permission-denied`: 보안 규칙에 걸린 것입니다. 저장하는 필드 이름이나 형식이 `firebase.js` 함수와 다른지 확인하세요. 규칙에 없는 필드를 추가하면 거부됩니다.
- 필드를 추가해야 하면 저(DB 담당)에게 말해 주세요. 규칙도 같이 바꿔야 합니다.

## 1. 게시판 (posts.html)

| 지금 코드 | 바꿀 내용 |
|---|---|
| `readPosts()` (localStorage 읽기) | `posts = await listPosts()` 또는 실시간 `watchPosts(list => { posts = list; renderPosts(); })` |
| 새 글 저장 (`nextPosts = [{ id: ..., authorId: DEMO_USER_ID ...}]`) | `await createPost({ title, body, dorm, typeCode })` |
| 수정 (`posts.map(...)`) | `await updatePost(editingId, { title, dorm, body, status, typeCode })` |
| 삭제 (`posts.filter(...)`) | `await deletePost(post.id)` |
| `isOwnPost`: `post.authorId === DEMO_USER_ID` | `post.authorId === user.uid` |
| `formatDate(post.createdAt)` | `formatDate(post.createdAt?.toDate?.())` |
| `SAMPLE_POSTS` | DB에 넣지 말고 삭제하거나 DB가 비었을 때만 보여주기 |

- `authorId`, `authorName`, `createdAt`, `updatedAt`은 `firebase.js`가 알아서 채웁니다.
- 채팅 버튼은 지금처럼 `chat.html?with=작성자UID&post=게시글ID`로 이동하면 됩니다. `post.authorId`가 이제 진짜 UID라서 그대로 동작합니다.

## 2. 성향 검사 (survey.html)

| 지금 코드 | 바꿀 내용 |
|---|---|
| `save()` (매 단계 localStorage 저장) | 그대로 두기. 진행 중 임시 저장 용도 |
| 결과 화면 (`renderResult`) 진입 시 | `await saveSurvey({ answers: state.answers, info: state.info, typeCode: code })` 한 번 호출 |
| `CANDIDATES` (예시 후보 A~H) | `await listSurveys(info.dorm)`로 같은 생활관 사용자 불러오기 |

`listSurveys()` 결과 한 명의 형태:

```js
{ uid: "상대 UID", name: "표시 이름", answers: {...}, info: { dorm, smoke, ... }, typeCode: "MCQH-I" }
```

기존 추천 코드가 쓰는 `{ id, r, info }` 형태로 바꾸는 예:

```js
const people = await listSurveys(info.dorm);
const candidates = people.map(p => ({
  id: p.uid,
  name: p.name,
  r: Object.fromEntries(AXES.map(a => [a.key, rightPercent(a.key, p.answers)])),
  info: p.info,
}));
```

- 화면에는 `m.cand.id` 대신 `m.cand.name`을 보여주세요. id는 UID라 읽을 수 없는 문자열입니다.
- 채팅 링크는 `chatLink(m.cand.id)`를 그대로 쓰면 `chat.html?with=상대UID`가 됩니다.
- 결과 페이지에서 게시판으로 보낼 때: `posts.html?type=${code}`

## 3. 채팅 (chat.html)

채팅방은 두 사람당 하나입니다. 같은 사람과 다시 들어오면 같은 방이 열립니다.

```js
import {
  requireLogin, openChat, watchChat, watchMessages,
  sendMessage, setChatStatus, getPost,
} from "./firebase.js";

const user = await requireLogin();
const params = new URLSearchParams(location.search);
const otherUid = params.get("with");
const postId = params.get("post"); // 게시판에서 왔을 때만 있음

// 상대 이름: 게시판에서 왔으면 게시글 작성자 이름 사용
const post = postId ? await getPost(postId) : null;
const chatId = await openChat(otherUid, postId, post?.authorName);

watchChat(chatId, chat => {
  // chat.status: "chatting" | "requested" | "matched" | "ended"
  // chat.names[otherUid]: 상대 이름
  // chat.requestedBy: 채택 요청 보낸 사람 UID
});

watchMessages(chatId, messages => {
  // messages: [{ text, type, senderId, mine, createdAt }]
  // mine === true 이면 내가 보낸 메시지
});
```

| 지금 코드 | 바꿀 내용 |
|---|---|
| `loadState()` / `saveState()` / `storageKey` | 삭제. 위의 `watchChat`, `watchMessages`가 대신함 |
| `addMessage(text, "mine")` | `sendMessage(chatId, text, "question")` |
| 상대 답변 시연 `sendAnswer` | 이제 상대가 직접 보냄 → `sendMessage(chatId, answer, "answer")` |
| 시스템 메시지 (`"system"`) | `sendMessage(chatId, "...", "system")` |
| `state.status = "requested"` | `setChatStatus(chatId, "requested")` |
| 수락 / 거절 | `setChatStatus(chatId, "matched")` / `setChatStatus(chatId, "chatting")` |
| 종료 | `setChatStatus(chatId, "ended")` |
| 말풍선 class (`mine`/`other`) | `msg.mine ? "mine" : (msg.type === "system" ? "system" : "other")` |

- 수락·거절 버튼은 **요청을 받은 사람에게만** 보여주세요: `chat.requestedBy !== user.uid`. 요청한 본인이 수락하려고 하면 보안 규칙에서 거부됩니다.
- 메시지는 500자까지 보낼 수 있고, 보낸 뒤에는 수정·삭제할 수 없습니다.
- "시연 데이터 초기화" 버튼은 DB 연동 후 삭제하면 됩니다.

## 4. 마이페이지 (mypage.html)

`dashboardData` 객체만 바꾸면 됩니다. 렌더링 함수는 그대로 쓸 수 있어요.

```js
import {
  requireLogin, getMyProfile, updateMyProfile,
  loadMySurvey, listMyPosts, listMyChats,
} from "./firebase.js";

const user = await requireLogin();

const dashboardData = {
  async load() {
    const [profile, survey, posts, chats] = await Promise.all([
      getMyProfile(), loadMySurvey(), listMyPosts(), listMyChats(),
    ]);
    return {
      profile: { nickname: profile?.name ?? "", intro: profile?.intro ?? "" },
      survey,
      posts,
      chats: chats.map(c => {
        const otherUid = c.members.find(id => id !== user.uid);
        return { partner: c.names?.[otherUid] ?? "상대방", partnerUid: otherUid, status: c.status };
      }),
    };
  },
  loadPosts: () => listMyPosts(),
  saveProfile: ({ nickname, intro }) => updateMyProfile({ name: nickname, intro }),
};
```

| 지금 코드 | 바꿀 내용 |
|---|---|
| `survey.resultCode` | `survey.typeCode` (DB에는 `typeCode`로 저장됨) |
| `renderPosts`의 `new Date(post.createdAt)` | `post.createdAt?.toDate?.()`. 정렬은 `listMyPosts()`가 이미 최신순으로 해줌 |
| 채팅 링크 `{ with: chat.partner }` | `{ with: chat.partnerUid }`. 화면 표시는 `chat.partner`(이름) 그대로 |
| `pageshow`에서 `dashboardData.load()` | `await dashboardData.load()` (비동기로 바뀜) |
| `saveProfile` 호출부 | `await dashboardData.saveProfile(...)`. 실패하면 catch로 오류 표시 |
| `storage` 이벤트 리스너 | 삭제 (localStorage 안 씀) |

- 닉네임은 20자, 자기소개는 120자까지입니다. 지금 입력칸의 `maxlength`와 같습니다.
- 닉네임을 바꿔도 **이미 쓴 게시글의 작성자 이름**과 **기존 채팅방에 표시되는 이름**은 예전 이름 그대로입니다. 새로 쓰는 글부터 바뀐 이름이 적용됩니다.
- 숨김 처리된 글(`post.moderation`)은 관리자 기능이 정해진 뒤에 동작합니다.

## 5. 관리자 페이지 (admin.html)

화면 코드는 그대로 두고, **아래 4군데만 복사해서 붙여넣으면** 됩니다.
`firebase.js`의 관리자 함수들이 기존 `adminPosts`와 똑같은 형태(이름, 인자, 반환값, ISO 날짜 문자열)로 동작하도록 맞춰져 있습니다.

### 관리자 지정 방법
- 회원가입하면 `users/{uid}` 문서에 `admin: 0`이 자동으로 저장됩니다.
- 관리자로 만들려면 **Firebase 콘솔 → Firestore → users → 해당 문서 → `admin` 값을 `1`로 수정**하세요.
  - 타입은 **number**여야 합니다. 문자열 `"1"`로 넣으면 관리자로 인식되지 않습니다.
  - 이 기능이 생기기 전에 가입한 계정은 `admin` 필드가 없습니다. **필드 추가 → `admin`, number, `1`**로 넣으면 됩니다.
- 사이트에서는 누구도 자기 `admin` 값을 바꿀 수 없습니다. 보안 규칙에서 막혀 있습니다.
- 관리자로 로그인하면 메인 페이지(`index.html`)에 **관리자 페이지** 카드가 나타납니다.

### ① `<script>` 태그 바꾸기 (161번째 줄 근처)

```html
<script type="module">
```

### ② 맨 위 `"use strict";` 바로 아래에 붙여넣기

```js
    import {
      requireAdmin, adminListPosts, adminListHistory, adminSetStatus, adminSetVisibility,
    } from "./firebase.js";
```

### ③ `const adminPosts = { ... };` 전체를 아래로 교체
`readDemoPosts`, `parseDemoHistory` 함수와 `POSTS_KEY`, `HISTORY_KEY` 상수는 지워도 되고 남겨둬도 됩니다.

```js
    // Firebase 연동: 관리자 권한은 Firestore 보안 규칙(users/{uid}.admin == 1)에서 서버가 검증합니다.
    // 숨기기·복구와 처리 이력 저장은 한 트랜잭션으로 처리되고, 처리 시각과 관리자 ID는 서버가 확정합니다.
    const adminPosts = {
      list: () => adminListPosts(),
      listHistory: () => adminListHistory(),
      setStatus: (id, expectedStatus, nextStatus) => adminSetStatus(id, expectedStatus, nextStatus),
      setVisibility: (post, hidden, reason) => adminSetVisibility(post, hidden, reason),
    };
```

### ④ 맨 아래 `initialize();`를 아래로 교체

```js
    await requireAdmin(); // 비로그인 → 로그인 화면, 관리자 아님 → 메인으로 이동
    initialize();
```

> `storage` 이벤트 리스너(`window.addEventListener("storage", ...)`)는 남겨둬도 동작에 문제없습니다. 정리하고 싶으면 삭제하세요.

### 동작 정리
| 기능 | 결과 |
|---|---|
| 글 숨기기 | 게시판 목록(`listPosts`)에서 사라짐. 작성자 본인과 마이페이지에서는 "숨김 처리됨"으로 보임 |
| 숨긴 글 | 작성자도 수정할 수 없음 (삭제는 가능) |
| 글 복구 | 다시 게시판에 표시됨 |
| 처리 이력 | `moderationLogs` 컬렉션에 저장. 관리자만 읽을 수 있고 수정·삭제 불가 |
| 동시에 두 관리자가 같은 글 처리 | 늦게 누른 쪽은 "글이 이미 변경되었어요" 안내 (기존 화면 로직 그대로) |

## 함수 목록 (firebase.js)

| 분류 | 함수 |
|---|---|
| 로그인 | `requireLogin()`, `currentUser()`, `onUserChanged(cb)`, `getMyProfile()`, `updateMyProfile({ name, intro })`, `logOut()` |
| 게시판 | `listPosts()`, `listMyPosts()`, `watchPosts(cb)`, `getPost(id)`, `watchPost(id, cb)`, `createPost(data)`, `updatePost(id, changes)`, `deletePost(id)` |
| 설문 | `saveSurvey({ answers, info, typeCode })`, `loadMySurvey()`, `listSurveys(dorm?)` |
| 채팅 | `openChat(otherUid, postId?, otherName?)`, `watchChat(id, cb)`, `setChatStatus(id, status)`, `sendMessage(id, text, type)`, `watchMessages(id, cb)`, `listMyChats()` |
| 관리자 | `isAdmin()`, `requireAdmin()`, `adminListPosts()`, `adminListHistory()`, `adminSetStatus(id, expected, next)`, `adminSetVisibility(post, hidden, reason)` |

`watch...` 함수는 구독을 멈추는 함수를 돌려줍니다. 페이지를 떠날 때 따로 호출하지 않아도 됩니다.
