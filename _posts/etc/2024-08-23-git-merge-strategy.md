---
layout: posts
title:  "git merge 전략"
author_profile: true
sidbar:
  nav: "main"
category: "etc"
description: "본 포스팅은 기존 블로그(<a href='https://velog.io/@hky035/git-merge'>https://velog.io/@hky035/git-merge</a>)에서 작성된 포스팅입니다."
published: true
show_date: true
---

# 서론

&nbsp; 필자는 처음으로 협업을 하게 되면서 Git Workflow를 도입하여 브랜치를 통하여 작업을 관리하였다. 

<img src="/assets/img/docs/etc/git-merge-strategy/git-error.png" href="git-error" />

&nbsp; 급하게 작업을 하며 feature 브랜치가 아닌 develop 브랜치에서 작업 후 이를 바로 develop 브랜치에 푸시하게 되었다. 푸시를 진행하자 위와 같은 에러 문구를 발견하였다. 

&nbsp; 정확한 해결방법을 몰랐지만 급히 작업을 진행하여야 했기 때문에 `git pull --rabase origin develop` 명령어를 통하여 develop 브랜치의 커밋을 로컬 develop 브랜치에 병합시킨 다음 어찌저찌 해결하여 넘어갔다.

&nbsp; 형상관리에 관한 문제는 협업을 할 때 가장 기본으로 해결이 되어야 하는 문제라고 생각하여, 해커톤이 끝난 후 가장 먼저 자세하게 살펴보았다. 해당 포스팅에서는 이 과정을 겪으면서 배웠던 git merge 전략을 풀어보고자 한다.

---

# 테스트 환경

&nbsp; 해당 포스팅에 앞서 사용 용어와 환경들을 설명하고자 한다.

## 용어 정리
- 원격 리포지토리: Github 상의 리포지토리
- 로컬 리포지토리: 원격 리포지토리와 연결된 내 PC 상의 리포지토리

## 디렉터리 구조

![](https://velog.velcdn.com/images/hky035/post/c96b69b2-6592-4d86-ba13-922624cea060/image.png)

&nbsp; 현재 원격 리포지토리의 main 브랜치에는 **README.md** 파일만 존재한다.

![](https://velog.velcdn.com/images/hky035/post/43cabfba-eb75-4f3d-9ff4-82987f6e09f0/image.png)

&nbsp; 현재 브랜치는 main, develop으로 구성되어 있으며, develop의 내용은 main과 동일하다. develop에서 feature/* 브랜치들을 만들어 새로운 기능(파일)을 추가한다.

![](https://velog.velcdn.com/images/hky035/post/3a715a16-d89a-4248-965e-21706e55efea/image.png)

&nbsp; 작업환경은 **VS code**이고, **git graph** 익스텐션을 사용하여 브랜치의 분기를 살펴본다.

---

# 해결 방법

&nbsp; 앞서 본 에러는 develop 브랜치에 `git push`를 하였을 떄 일어나는 에러였다.

<img src="/assets/img/docs/etc/git-merge-strategy/git-error.png" href="git-error" />

&nbsp; 에러 문구에서 확인할 수 있듯이 해당 에러는 로컬에서 작업을 끝낸 후 develop 브랜치로 push를 보낼 때 <u>원격 develop 브랜치와 로컬 develop 브랜치 간 커밋이 다르기</u> 때문에 발생하는 에러이다.

&nbsp; 즉, 필자가 에러를 겪었던 상황은 본인이 develop 브랜치에서 작업을 하던 중, 다른 누군가가 develop 브랜치에 커밋을 남겨(PR이 병합됨) 커밋 내용이 차이가 생긴 것이다.

![](https://velog.velcdn.com/images/hky035/post/1ce12da3-3a16-4254-9edb-aab3e0c5c0fc/image.png)

&nbsp; 위와 같은 상황이 있다고 가정하자.   

&nbsp; 다른 팀원이 작업을 마친 후, 로컬 develop → 원격 develop 브랜치로 작업 내용을 push하였다.   
&nbsp; 그렇다면, 현재 원격 develop 브랜치에는 팀원의 커밋이 추가되어 있을 것이다.   

&nbsp; 이제, 본인이 작업을 마치고 작업 내용을 push 하였을 때 develop 브랜치의 커밋 내역이 다르기 때문에 **"해당 커밋의 내용이 어느 위치에 들어가야 하지?"**라는 모호함이 생긴다. 이것이 해당 오류가 발생하는 이유이다.   

&nbsp; 해당 에러 문구에서 제시된 해결 방법은 `git pull` 명령어를 통해 커밋 내용을 일치시키는 것이다.
&nbsp; 즉, <u>원격 develop과 로컬 develop의 커밋 내역을 동기화</u>해야한다.

# git pull

&nbsp; 이에 대한 내용을 알아보기에 앞서 git pull에 대해 알아보고자 하였다.   
&nbsp; 왜냐하면, <span style="font-family: 'Roboto Slab'">"git pull rabase, ff"</span>에 대해 검색해보았을 때, **git merge ...**를 통한 설명이 많았기 때문이다.

&nbsp; 에러 로그에서 제시된 방법은 `git pull` 이지만 rebase, ff 전략을 검색하니 `git merge` 관련 이야기가 나와서 이해하는데 불편함을 겪었다. 그러나, 이는 필자가 git pull에 대해 잘 몰랐기 떄문에 발생한 것 이었다.

&nbsp; 처음에는 그저 `git pull`이 <span style="font-style: italic;">"원격 리포지토리 내용을 가져오는 것"</span> 정도로 알고 있었다. 틀린 이야기는 아니다.

&nbsp; **git pull**은 <span style="background-color: rgba(255, 255, 0, 0.5);">**git fetch + git merge**</span>가 합쳐진 명령어이다.

- git fetch: 원격 리포지토리 → 로컬 리포지토리로 변경 내용을 가져 옴
- git merge: 체크아웃된 브랜치를 병합

&nbsp; 이 개념을 더욱 자세히 알아보기 위해 로컬 리포지토리에서 로컬, 원격 브랜치들을 알아본다.

![](https://velog.velcdn.com/images/hky035/post/3a715a16-d89a-4248-965e-21706e55efea/image.png)

```
git branch -al
```

&nbsp; 위 명령어를 통하여 로컬과 원격의 리포지토리를 확인할 수 있다.   
&nbsp; 이 때, 빨간색으로 보이는 <span style="color: red; font-weight: bold; font-family: 'Roboto Slab'">remote/origin/*</span>는 원격 리포지토리를 나타내긴 하지만, 원격에 있는 브랜치와 동일하지 않다.

&nbsp; `git fetch` 명령어는 <u>원격 리포지토리의 브랜치 내용을 가져와 remote/origin/{branch}에 저장</u>한다. 즉, 원격 리포지토리의 내용을 로컬에 저장하는 것이다.

> 이 때, 로컬에 origin/{브랜치명}이 없으면, origin/{브랜치명} 브랜치를 생성한 뒤, 해당 브랜치에 원격 브랜치의 내용을 저장한다.

&nbsp; 이후, `git merge`를 통해 로컬의 <span style="text-decoration: underline;">remote/origin/{branch} → 로컬의 {branch}로 병합</span>한다.

&nbsp; 즉, 우리가 해결을 위해 **git pull 시 줄 수 있었던 여러가지 병합 옵션(전략)은 사실 git merge의 전략을 결정**하는 것이다.

# git merge 전략

&nbsp; 병합(merge) 전략은 아래 4가지로 분류된다.

- merge commit
- squash
- rebase
- ff (fast forward)

![](https://velog.velcdn.com/images/hky035/post/5b1d7ccf-e3c8-4b51-8b0f-b828bda33edb/image.png)

&nbsp; 우선, feature/A 브랜치를 생성한다. 현재 시점의 커밋에는 `feature/A`, `develop`, `main`, `origin/HEAD`가 위치한 것을 알 수 있다.

![](https://velog.velcdn.com/images/hky035/post/55141615-2af8-40c9-bfa4-ace92e90d23d/image.png)

![](https://velog.velcdn.com/images/hky035/post/d8f976fb-a88a-4442-bb5b-6d6471ce28ae/image.png)

&nbsp; feature/A에서 A.txt 파일을 생성한다. 현재 커밋을 남기지 않았기에 해당 커밋은 uncommitted changes로 보인다.

![](https://velog.velcdn.com/images/hky035/post/655a41dc-9f94-45ce-92ab-b527f97cb320/image.png)

&nbsp; 변경 내용을 커밋(make A)까지 해주니, feature/A가 초기 위치의 브랜치들의 집합에서 빠져나온 것을 알 수 있다. 즉, **해당 브랜치에서는 새로운 커밋(작업 내용)이 생겨 분기가 생긴 것**이다.

![](https://velog.velcdn.com/images/hky035/post/9fa6d170-d991-489a-9294-c4b66bc7b0f7/image.png)

![](https://velog.velcdn.com/images/hky035/post/607adbea-6b83-4839-b1d6-94b73347d50b/image.png)

&nbsp; A.txt 파일을 수정하여 새로운 커밋을 생성한다. 똑같이 uncommited changes라고 보인다. 이제 수정을 완료했다는 커밋을 작성해보자.

![](https://velog.velcdn.com/images/hky035/post/aaf37687-177f-458d-bf97-c1656663ee05/image.png)

&nbsp; A.txt 파일에 대한 수정 커밋(modify A) 시점으로 feature/A가 위치한 것을 알 수 있다. 정확히는 feature/A의 HEAD(가장 최근 커밋)이다.

&nbsp; 이제 feature/A를 develop에 합쳐보자.

![](https://velog.velcdn.com/images/hky035/post/d9939cce-0876-4526-ad34-12deb5515845/image.png)

&nbsp; develop 브랜치로 바꾸자 현재 위치가 맨 초기의 커밋에 위치된 것을 알 수 있다.

![](https://velog.velcdn.com/images/hky035/post/2aba9b65-410a-4fa6-9572-e88c902a063c/image.png)

&nbsp; 아무 옵션도 주지 않고 feature/A를 develop에 병합(merge)하자 develop 태그가 feature/A의 분기로 간 것을 확인할 수 있다. 이는 **ff** 방식으로, <u>병합하려는 브랜치가 ff 관계이면 알아서 ff 방식으로 결합한다.</u> ff 관계에 대해서는 <a href='#fast-forward'>아래</a>에서 자세하게 서술한다.

---

![](https://velog.velcdn.com/images/hky035/post/d9d10de7-b034-4471-bf06-11a5bbf6a5f1/image.png)

![](https://velog.velcdn.com/images/hky035/post/0ed480b1-0b1c-4ba8-baba-f7829aacbe35/image.png)

&nbsp; 이제 feature/B 생성 후, B.txt 파일은 만들고 수정을 하여 여러 개의 커밋이 발생하였다.

![](https://velog.velcdn.com/images/hky035/post/697b06ef-ea79-4bf2-92be-8dcb984074e2/image.png)

&nbsp; 이 상태에서 develop 브랜치로 돌아오게(checkout)되면 B.txt 파일이 삭제된 것을 알 수 있다. B.txt 파일은 feature/B 브랜치에서 생성한 것이므로 사라지는 것이 당연하다.

&nbsp; 이 때, **develop에 새로운 커밋을 하나 만들어보자.**

![](https://velog.velcdn.com/images/hky035/post/0dd28e08-041e-49a1-a61b-75c706e56643/image.png)

![](https://velog.velcdn.com/images/hky035/post/55780497-521b-48fd-86c1-8b06cd5b5348/image.png)

&nbsp; develop 브랜치에 Develop.txt 파일을 생성하니 git graph에서 분기가 명확히 나뉜 것을 확인할 수 있다. 이 상태는 ff 관계가 깨진 것이다. 즉, feature/B가 가지지 않은 커밋을 develop이 가지고 있다는 뜻이다.

![](https://velog.velcdn.com/images/hky035/post/7673ef2a-01cb-4a42-81b0-4ce0f7aad6ef/image.png)

&nbsp; develop의 변경사항을 커밋하면 develop 태그의 위치또한 변경된 것을 알 수 있다. 이제 확실하게 develop과 feature/B 간의 커밋 차이가 존재한다.

&nbsp; 이제 feature/B → develop으로 여러 merge 전략을 적용시켜본다.

## 1. merge commit

&nbsp; merge commit은 병합 시 **브랜치 내 모든 커밋을 베이스 브랜치로 합친 뒤 병합 시점의 커밋 메시지도 추가적으로 남기는 전략**이다.

```
git merge feature/B
```

![](https://velog.velcdn.com/images/hky035/post/6bbee023-cd06-4f0d-ab25-e40ae8011d83/image.png)

&nbsp; 병합을 하자 위 결과와 같이 커밋 메시지 작성 에디터로 이동하게 된다. 이는 앞서 merge commit이 병합 시점에 남길 커밋에 대한 메시지를 남기기 위함이다.

![](https://velog.velcdn.com/images/hky035/post/51dbb990-bec9-488e-8322-9a191f214eae/image.png)

![](https://velog.velcdn.com/images/hky035/post/7b04bb5c-477c-49ab-a6bf-a9523a6a077c/image.png)

&nbsp; 커밋 메시지 작성을 완료하면 다음과 같이 **병합된 시점의 커밋이 새로 생기며 병합이 진행**된 것을 알 수 있다.

&nbsp; 이것이 바로 <u>병합(merge)된 시점의 커밋(commit)을 남기는</u> **merge commit** 전략이다.

![](https://velog.velcdn.com/images/hky035/post/9baef191-5c78-4f4a-b228-d5b09aecd71c/image.png)

![](https://velog.velcdn.com/images/hky035/post/bb903993-a63c-4368-9eba-0a6b28f115b6/image.png)

&nbsp; 다른 전략을 테스트해보기 위해 `git reset HEAD^` 명령어를 통하여 최근 커밋을 삭제하였다. 그렇다면 다음과 같이 병합하기 전 상태로 돌아온 것을 확인할 수 있다. 

## 2. squash and merge

&nbsp; squash and merge는 병합 시 **브랜치 내 모든 커밋을 하나의 커밋 메시지로 통합시켜 베이스 브랜치에 해당 커밋만을 반영하여 병합하는 전략**이다.

![](https://velog.velcdn.com/images/hky035/post/6764d0d8-4854-4e63-8524-d94a0ce4ce3a/image.png)

```
git merge --squash feature/B
```

&nbsp; `--squash` 옵션을 주어 브랜치 병합 시 병합 시점을 남길 커밋에 대한 메시지를 작성하여야 하기 때문에 vscode의 커밋 메시지 작성란에 자동적으로 커밋 메시지가 생성되었다.

&nbsp; 필자는 병합 메시지를 "squash and merge - feature/B to develop"으로 병합을 진행하였다.

![](https://velog.velcdn.com/images/hky035/post/04882a55-c50d-4427-95be-754bb09469bc/image.png)

&nbsp; 위와 같이 feature/B의 분기가 develop에 합쳐지지 않고, develop에 병합 시점의 커밋 메시지만 남겨진 것을 확인할 수 있다.

![](https://velog.velcdn.com/images/hky035/post/2b2ccda0-2706-48d6-bef8-3489dcc12b74/image.png)

&nbsp; 커밋 로그를 통해 살펴보면 develop에선 feature/B에서 작업한 커밋 내용은 보이지 않고, squash and merge 병합 시점에서 남겼던 메시지 "squash and merge - feature/B to develop"만 확인이 가능하다.

![](https://velog.velcdn.com/images/hky035/post/a5ed8b24-a790-4c50-8a18-8312478d2b17/image.png)

&nbsp; 다시 리셋을 통해 병합 이전 시점으로 돌아간다. B.txt 파일이 남아있다면 change를 discard 해버린다.

## 3. rebase

&nbsp; reabse는 병합 시 **브랜치 내 모든 커밋을 베이스 브랜치에서 분기한 시점을 기준으로 모두 추가하는 병합 전략**이다.

![](https://velog.velcdn.com/images/hky035/post/c0419783-34e9-40ce-8a92-2e78e6e6f1cf/image.png)

```
git rebase feature/B
```

&nbsp; develop 브랜치에서 `git rebase feature/B` 명령어를 통하여 rebase 병합을 실행한다. git graph를 확인하면 분기가 아예 사라진 것을 확인할 수 있다.

&nbsp; 당연하다. rebase는 해당 브랜치의 커밋을 베이스 브랜치로 모두 옮기기 때문이다.   

&nbsp; 따라서, feature/B는 modifyB에 머물러 있고, develop에는 feature/B가 분기한 후 커밋한 내용이 모두 추가된 것을 확인할 수 있다.

<h2 id="fast-forward">4. fast forward</h2>

&nbsp; fast forward(ff)는 **병합하려는 두 브랜치가 ff 관계일 때, 베이스 브랜치의 태그 위치(현재 커밋 위치)를 병합하려는 브랜치의 최종 커밋 위치로 옮기는 전략**이다.

![](https://velog.velcdn.com/images/hky035/post/9b50e755-f161-41fb-8dc3-1241f062b107/image.png)

&nbsp; develop에서 feature/C를 만들고, make C, modify C 커밋을 남겼다.

&nbsp; 분명 feature/C에서 만들었는데 한 줄의 그래프로 나와서 당황할 수는 있겠지만, 이것이 ff 관계이며 구부러진 그래프가 모두 순차적으로 이어져있기에 마치 한 줄처럼 볼 수도 있다고 생각하면 된다.

![](https://velog.velcdn.com/images/hky035/post/9f873796-9866-46ab-ae24-6da83e471b27/image.png)

&nbsp; fast forward는 베이스 브랜치 위치를 타겟 브랜치의 맨 마지막 커밋 위치로 옮기는 것이다.

&nbsp; 당연히 한 줄에 있기 때문에 커밋 순서 등이 헷갈릴 일이 없기에 git graph 내에서는 태그의 위치만 바뀌게 되는 것이다.

![](https://velog.velcdn.com/images/hky035/post/01407090-ae44-49dc-9f4d-9742ffecc050/image.png)

&nbsp; 태그의 위치만 옮기는 것이기에 커밋 메시지를 따로 남길 필요가 없다. 이것이 앞서 본 ff 관계 여부에 따른 병합 전략의 차이이다.

&nbsp; 한번 더 정리하면, **병합을 할 두 브랜치가 ff 관계이면 병합(merge) 시 자동으로 ff merge로 병합**된다.

&nbsp; 그러나, ff 관계임에도 병합 시점의 커밋을 남기고 싶다면 아래와 같은 명령어를 사용하면 된다.

```
git merge --no-ff feature/*
```

# git pull 전략을 통한 커밋 충돌 문제 해결

&nbsp; 자, 그러면 초반에 발생하였던 에러를 해결해보자!

![](https://velog.velcdn.com/images/hky035/post/5a7408d0-bbac-413e-b2b4-6beec0c432a3/image.png)

&nbsp; `git push origin develop` 시 에러가 난 상황은 위와 같은 상태이다.

&nbsp; 에러를 해결하기 위해 `git pull --reabse origin develop`을 한다면?

![](https://velog.velcdn.com/images/hky035/post/37eb1c5e-df84-4b8d-a077-90ba015b7f78/image.png)

![](https://velog.velcdn.com/images/hky035/post/c9669eb9-7520-4911-9a37-6762e697bc0f/image.png)

&nbsp; rebase 전략을 사용하여 원격 develop과 로컬 develop의 커밋을 동기화시켰기 때문에 이제 push에 문제가 없다.

# 결론

&nbsp; 형상 관리는 협업에 있어 가장 기본이 되는 요소이자 중요한 부분이다. 가장 좋은 방법은 위와 같은 에러 상황이 일어나지 않도록 브랜치를 엄격히 관리하고 병합 등에 대한 제한을 두는 것일 것이다.

&nbsp; 단순히 명령어만 입력하여 Git을 사용하는 것이 아니라, 동작 원리 등에 대해 깊이있게 찾아보는 것이 진정 Git을 사용한다고 이야기할 수 있을 것 같다. 또한, 해당 내용을 다 이해하고보면 그렇게 어려운 개념이 아니라 당연한 개념이었다. 전략은 여러 개 있지만 각 전략에 따른 차이를 이해하는 것은 큰 도움이 되었다. PR 병합 시에 "커밋 수를 줄여주니까 좋네"라며 사용했던 squash and merge 방법에 대해서 조금 더 심도있게 생각해볼 수 있었던 기회가 되었던 것 같다.