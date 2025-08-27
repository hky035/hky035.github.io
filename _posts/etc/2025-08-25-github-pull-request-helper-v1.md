---
layout: posts
title: 'Github Pull Request Helper 크롬 확장 프로그램 개발'
author_profile: true
sidbar:
   nav: 'main'
category: 'etc'
description: '협업을 하며 Github Pull Request를 확인하는 것이 일상이 되었다. Pull Request 작성자가 올린 PR Description을 이용하여 기능과 코드의 명세를 확인한다. 이때, PR Description을 확인하기 위해 변경사항(File Changed) 탭을 번갈아 확인하는 과정을 반복하며 불편함을 느끼고 있었다. <br/>그러던 중 변경사항 탭에서도 PR Description을 확인할 수 있다면, 사용자 경험 측면에서도 되게 편리할 뿐더러 불필요한 페이지 이동과 PR Description API 호출이 줄어들 것이라 생각하여 이를 적용할 방법을 생각해보았다. 그러던 중 평소에도 Github 관련 크롬 확장 프로그램(Chrome Extension)을 사용하였기에 이를 활용하여 나만의 크롬 확장 프로그램을 만들어보기로 하였다.'
published: true
show_date: true
---

# 서론

&nbsp; 최근 개인 프로젝트나 협업을 진행하며 Github Pull Request를 확인하는 것이 일상이 되었다. 

&nbsp; Pull Request를 확인할 때, 해당 PR에 들어가서 작업자가 작성한 Description을 확인한 뒤, 커밋과 변경사항(File Changed) 탭에서 작업 내용을 확인하곤 한다.

&nbsp; PR Description에는 해당 작업에 대한 배경, 작업 내용, 인수 기준, 테스트 결과, 적용 결과 등 다양한 내용을 확인할 수 있다. 해당 내용은 작업자의 작업 사항을 이해하는데 중요한 지표가 된다.

&nbsp; 따라서, 커밋이나 변경사항 탭에서 작업 내용을 확인할 때, PR Description을 옆에 켜두고 동시에 확인하곤 한다. 커밋 탭의 경우에는 해당 작업의 내용에 대한 설명을 커밋 제목으로 알 수 있기 때문에 어느정도 작업 내용 파악이 가능하다. 그러나, 변경사항 탭에서는 커밋의 내용과 PR Description 내용을 확인할 수가 없어 불편함을 겪은 경험이 있다.

&nbsp; 물론 보조 모니터 등의 장치가 있다면, 여러 개의 윈도우를 활용해 양쪽에서 확인이 가능하기 때문에 크게 문제가 없다고 느낄 수 있다. 그러나, 학교나 외부를 다니면서 주로 노트북을 사용하기 때문에 하나의 모니터만을 사용하여 PR Description과 File Changed를 번갈아가며 확인하는 경우가 많다.

&nbsp; 이러한 불편함에서 "계속해서 탭을 전환해가면서 확인을 해야하나?", "계속해서 PR Description과 File Changed 페이지를 번갈아가며 api 요청을 해야하나?" 라는 생각 끝에 <span class="underline-highlight">"변경사항 탭에서 PR Description을 확인할 수 있다면 어떨까?"</span>라는 질문에 도달하게 되었다. 지속되는 API 호출도 줄일 뿐더러, 별다른 설명이 없는 변경사항 페이지에서 PR Description을 확인할 수 있도록 하여 탭을 번갈아가며 확인하는 사용자의 수고로움을 덜어낼 수도 있다는 긍정적인 효과가 기대되었다.

&nbsp; 따라서, **Github Pull Request Helper**라는 크롬 확장 프로그램을 만들어보기로 하였다. 우선은 이 프로젝트의 시작에 있었던 질문이자 제안인 '변경사항 탭에서 PR Description 확인하기 기능'이라는 최소한의 기능만을 갖춘 채 출시해보기로 하였다. 

# 본론

&nbsp; 크롬 확장프로그램을 만들기 위해서는 크게 3가지의 구성요소가 필요하다.

- manifest.json
- 확장프로그램 아이콘 클릭 시 등장하는 팝업(Popup) 관련 파일
- 확장프로그램이 특정 사이트에서 동작할 기능 관련 파일

## manifest.json

&nbsp; [MDN Browser Extensions > manifest.json 문서](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json)를 참고하면 <span class="code">manifest.json</span>은 Web Extension APIs를 사용할 경우 꼭 포함시켜야할 파일로, 확장프로그램의 기본적인 메타데이터, 버전과 백그라운드 스크립트, 콘텐츠 스크립트, 브라우저 액션과 같은 기능적인 측면들도 명세할 수 있다고 한다.

&nbsp; 예외적으로 json 스타일의 파일이지만, `//` 스타일의 주석이 가능하도록 허용한다고 한다.

```json
{
  "manifest_version": 3,
  "name": "GitHub Pull Request Helper",
  "version": "1.1.0",
  "description": "GitHub Pull Request 관련 다양한 부가 기능들을 이용해보세요.",
  "icons": {
    "16": "images/logo_16.png",
    "32": "images/logo_32.png",
    "48": "images/logo_48.png",
    "128": "images/logo_128.png"
  },
  "action": {
    "default_popup": "popup/popup.html"
  },
  "content_scripts": [
    {
      "matches": ["https://github.com/*/*/pull/*/files"], // 차후 Github SPA 문제로 인하여 변경 및 서술 예정
      "js": ["content.js"],
      "css": ["style.css"]
    }
  ]
}
```

&nbsp; manifest_version, name, description, icons 등 확장 프로그램에 대한 기본적인 메타 정보를 포함한다. 

&nbsp; [action](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/action)에서는 확장 프로그램바(또는 툴바)에 표시되는 확장 프로그램의 아이콘과 관련된 설정을 정의하는 영역이다. 해당 프로젝트에서는 확장 프로그램 아이콘을 클릭하였을 때 간단한 팝업 창을 띄어 사용자에게 확장 프로그램 사용을 위한 안내 사항과 문의처 등에 관한 사항을 명시하려 한다.

&nbsp; [content_script](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/content_scripts)는 URL 패턴에 매칭하는 웹 페이지에 접속하였을 경우 로드할 콘텐츠 스크립트(content script)를 정의하는 영역이다.

```
# Pull Request File Changed 탭 주소
https://github.com/hky035/Github-Pull-Request-Helper/pull/1/files

# 패턴 매칭을 위한 와일드카드 처리
https://github.com/*/*/pull/*/files
```

&nbsp; Pull Request의 변경사항(File Changed) 탭의 주소는 위와 같다. 따라서, 해당 확장 프로그램이 동작하기 위해 <span class="code">content_script</span>의 <span class="code">matches</span> 부분에 변경사항 탭의 주소 패턴 매칭을 위한 와일드카드 처리 주소를 표기하였다. 해당 경로는 <span class="underline-highlight">SPA의 특성 상 Github의 페이지가 새로고침이 되지 않는 문제로 인하여 변경</span>하였다. 이는 아래에서 추가적으로 서술할 것이다.

## content.js

&nbsp; 초기 설계한 <span class="code">content.js</span>의 주요 로직은 다음과 같다.

1. <span>Github Pull Request File Changed 탭에 접속하면, 해당 PR Description 페이지로 요청을 보낸다.</span>
2. <span>응답온 html 코드에서, PR Description 부분의 코드를 추출한다.</span>
3. <span>File Changed 탭에서 추출한 Description을 삽입하여 보여준다.</span>

&nbsp; 아래는 전체 로직이다. 

```javascript
const PROJECT_TITLE = "GH_PR_HELPER";
const CONTAINER_ID = 'pr-description-viewer-container';
const PR_DESCRIPTION_CLASS_NAME = "pr-description-summary";
const CACHE_NAME_PREFIX = "pr-description-cache"
const CACHE_EXPIRATION_MS = 300000; // 3min = 3 * 60 * 1000(ms)

/**
 * Fetches the PR description from the network, caches it, and returns the element.
 * 
 * @returns {Promise<Element|null>} The description element or null if failed.
 */
const fetchAndCacheDescription = async (prUrl, cacheKey) => {
    console.log(`[${PROJECT_TITLE}] Fetching description from network.`);
    try {
        const response = await fetch(prUrl);
        if (!response.ok) {
            return null;
        }
        const html = await response.text();

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const descriptionElement = doc.querySelector('.comment-body');

        if (descriptionElement) {
            const itemToCache = {
                html: descriptionElement.outerHTML,
                timestamp: Date.now()
            };
            sessionStorage.setItem(cacheKey, JSON.stringify(itemToCache));
            return descriptionElement;
        }
    } catch (error) {
        console.error(`[${PROJECT_TITLE}] Failed to fetch description:`, error);
    }
    return null;
};

/**
 * Injects the Pull Request description into the 'Files Changed' tab.
 */
const injectDescription = async () => {
    observer.disconnect();
    
    try {
        if (document.getElementById(CONTAINER_ID)) return;
        const container = document.getElementById('files');
        if (!container) return;

        const prUrl = window.location.href.replace('/files', '');
        const cacheKey = `${CACHE_NAME_PREFIX}:${prUrl}`;
        let descriptionElement;

        const cachedItemString = sessionStorage.getItem(cacheKey);

        if (cachedItemString) {
            const cachedItem = JSON.parse(cachedItemString);
            const cacheAge = Date.now() - cachedItem.timestamp;

            if (cacheAge < CACHE_EXPIRATION_MS) {
                console.log(`[${PROJECT_TITLE}] Loading description from valid cache.`);
                const parser = new DOMParser();
                const doc = parser.parseFromString(cachedItem.html, 'text/html');
                descriptionElement = doc.body.firstChild;
            } else {
                console.log(`[${PROJECT_TITLE}] Cache expired.`);
            }
        }

        // If description is not loaded from cache (either missing or expired), fetch it.
        if (!descriptionElement) {
            descriptionElement = await fetchAndCacheDescription(prUrl, cacheKey);
        }

        // If we have a description element (from cache or fetch), inject it.
        if (descriptionElement) {
            const descriptionContainer = document.createElement('details');
            descriptionContainer.id = CONTAINER_ID;
            descriptionContainer.open = true;

            const summary = document.createElement('summary');
            summary.textContent = 'Pull Request Description';
            summary.className = PR_DESCRIPTION_CLASS_NAME;

            descriptionContainer.appendChild(summary);
            descriptionContainer.appendChild(descriptionElement);

            container.prepend(descriptionContainer);
        }
    } catch (error) {
        console.error(`[${PROJECT_TITLE}] Error in injectDescription:`, error);
    } finally {
        observer.observe(document.body, { childList: true, subtree: true });
    }
};

// Create a new MutationObserver instance with the callback.
const observer = new MutationObserver(() => {
    if (window.location.href.includes('/files') && !document.getElementById(CONTAINER_ID)) {
        injectDescription();
    }
});

// Start observing the document body for added/removed nodes in the entire subtree.
observer.observe(document.body, { childList: true, subtree: true });
```

&nbsp; 각 함수 및 객체에 대한 명세는 다음과 같다.

### 1. fetchAndCacheDescription(prUrl, cacheKey)

&nbsp; 해당 함수는 Github PR Description 페이지에 요청을 보내, 응답 값(html) 내에서 PR Description 부분을 추출하여 이를 세션에 타임스탬프와 함께 저장하고 Description을 반환한다.

&nbsp; Github Pull Request 페이지의 코드를 확인해보면 Description의 클래스 이름은 `.comment-body`이다. 따라서, 해당 클래스 이름을 통해 코드를 추출한다.

&nbsp; 또한, 추출한 코드를 **세션 스토리지(Session Storage)에 저장**한다. 

&nbsp; PR Description을 세션 스토리지에 저장하는 이유는 PR Description은 주로 잘 변경이 되지 않는 컨텐츠이자, 다른 페이지로 이동했다가 다시 변경사항 탭으로 돌아온 경우 매번 PR Description 페이지에 요청을 보내게되면 기존에 있었던 문제점과 크게 다르지 않는 성능적 문제가 존재한다고 생각해 세션 스토리지에 캐싱하는 방식으로 이를 개선하고자 하였다.

&nbsp; 그러나, PR Description은 향후 수정될 수도 있기 때문에 캐싱된 시간을 기준으로 다시 새로운 데이터를 받아올지 결정하기 위하여 현재 시간(타임스탬프)을 함께 JSON 형태로 저장하기로 하였다.

### 2. injectDescription()

&nbsp; 해당 함수는 사용자가 Pull Request File Chagned 탭에 접속하였을 때 캐싱되거나 요청을 통해 받아온 PR Description 데이터 컴포넌트를 페이지 내에 삽입하기 위한 메인 로직을 담당하고 있다. 

&nbsp; 변경사항 탭 내에서 새로 추가될 컴포넌트의 id는 `CONTAINER_ID = 'pr-description-viewer-container'`이다. 해당 아이디의 컴포넌트(DOM 요소)가 이미 존재하면 PR Description이 이미 제공된 상태이니 함수를 종료한다.

&nbsp;이후 PR Description 데이터(html 코드)를 삽입하기 위해 기준이 되는 요소 찾기 위하여, 변경사항 탭 내에서 `files` 아이디를 가진 컨테이너(요소)를 찾아서 저장한다.

&nbsp; 그리고, 변경사항 탭에 있는 사용자의 현재 위치(`https://github.com/*/*/pull/*/files`)에서 `/files` 경로를 제거해 PR Description을 가져오기 위한 주소를 완성한다. 해당 함수는 이후 <span class="code" style="text-decoration: underline;">MutationObserver</span>에 의해 사용자가 접속한 경로가 `/files`를 포함할 경우에만 동작하기 때문에 사용자가 변경사항 탭에 위치한 경우에 동작하게 된다.

&nbsp; 이후 캐시 키 포맷과 PR url을 조합하여 세션 스토리지에 저장된 PR Description 데이터를 조회한다. 데이터가 존재할 경우 해당 데이터를 읽은 다음, 저장된 타임 스탬프의 기간을 통해 만료 기한(3분)이 초과되었는지 확인한다. 만약, 초과되지 않았을 경우에는 <span class="code" style="text-decoration: underline;">DOMParser</span>에 의해 해당 html 코드를 변환하여 `descriptionElement` 변수로 할당한다.

&nbsp; 만료 기한이 초과된 경우에는 캐시 만료 로그를 출력한다.

&nbsp; 이후, 캐시에 저장된 데이터가 존재하기 않거나 데이터의 만료기한이 초과된 경우에는 `fetchAndCacheDescription(prUrl, cacheKey)`를 호출하여 불러온 PR Description 데이터를 `descriptionElement`에 저장한다.

&nbsp; `descriptionElement`가 있을 경우에 컴포넌트를 생성해 추가한다. 이 때, `details` 요소를 통해 PR Description을 토글하여 확인할 수 있는 기능을 제공하도록 한다. 또한, 해당 요소의 아이디를 지정해준다.

&nbsp; 최종적으로 `container.prepend(...)` 메서드를 통해 container의 첫번째 자식 이전 노드에 PR Description 정보를 삽입한다.

### 3. MutationObserver

&nbsp; [MutationObserver](https://developer.mozilla.org/ko/docs/Web/API/MutationObserver)는 DOM 트리의 변경을 감지할 수 있는 기능을 제공하는 인터페이스이다. 이벤트 감지 시 실행할 콜백 함수를 지정해줄 수 있다. 

&nbsp; 단순히 해당 페이지에 접속했을 뿐만 아니라, 이미 기존에 PR Description을 삽입한 경우에는 추가적으로 PR Description을 삽입할 필요가 없다. 또한, SPA 방식으로 동작하는 듯한 Github 페이지에서 해당 함수가 제대로 동작하기 위해 DOM 트리의 변화를 감지하는 <span class="code">MutationObserver</span>를 사용한다.

&nbsp; <span class="code">MutationObserver</span> 객체의 콜백 메서드는 현재 사용자의 위치가 `/files`이면서 기존의 PR Description이 삽입되지 않은 경우에 `injectDescription()`을 실행하는 로직을 가지고 있다.

```javascript
observer.observe(document.body, { childList: true, subtree: true });
```

&nbsp; 또한, `observer.observe(...)` 메서드를 통해 `document.body`와 그 자식과 서브 트리가 변경된 경우를 매번 감지하여 콜백 메서드를 실행하게 된다.

# Result

![result](/assets/img/docs/etc/github-pull-request-helper-v1/result.png)

![session-storage](/assets/img/docs/etc/github-pull-request-helper-v1/session-storage.png)





&nbsp; 해당 확장 프로그램 적용 결과는 위와 같다. 변경사항(File Changed) 탭 내에서 PR Description을 확인할 수 있게 되었다.

&nbsp; 또한, 세션 스토리지 내에 PR Description 정보와 저장 시간 데이터가 JSON 형태로 저장된 것을 확인할 수 있다.

# TroubleShooting - Github SPA


<div style="border: 0.5px solid #000; border-radius: 5px; padding: 10px;">
  <div style="font-weight: bold; margin-bottom: 5px;">관련 PR</div>
  <i class="fas fa-link"></i> <a href="https://github.com/hky035/Github-Pull-Request-Helper/pull/1">[Fix] Github SPA에 따른 함수 미실행 오류 문제 해결</a>
</div>

&nbsp; 초기 출시 이후 여러 가지 상황을 테스트해보기 시작하였다. 

&nbsp; 기존에는 단순히 <span style="font-style: italic;">"mainfest에 변경사항 탭 주소를 설정했으니까, 변경사항 탭에 접속만 하면 잘 동작하겠지?"</span>라는 생각으로 테스트도 Github Pull Request url을 통해 바로 접근하고, 페이지 새로고침 등의 방법을 통해 적용 여부를 확인하였다.

&nbsp; 그러나, 깃허브 시작 페이지부터 순차적으로 Pull Request File Changed 탭에 접속하니 아예 함수 자체가 호출이 되지 않는 문제가 발생하였다.

&nbsp; 해당 문제는 정확하지는 않지만 <u>SPA 특성을 보이는 Github 페이지의 초기에서부터 접속한 일부 컴포넌트만 변경될 뿐, 새로고침이 되지 않는 문제로 인해 발생하는 것</u>이라 생각하였다.

&nbsp; 따라서, 깃허브 초기 페이지에서부터 접속하는 경우에는 SPA 특성에 따라 컴포넌트만 변경되어 표면적으로 보이는 url만 변경될 뿐 새로고침이 되는 형태가 아니기 때문에 manifest.json에 명시된 경로와 일치하는지 여부 조차도 확인할 수가 없어 문제가 발생한 것이다.

&nbsp; 해당 문제를 해결하기 위하여 SPA와 MutationObserver의 특성을 사용해보기로 하였다.

&nbsp; 현재 문제는 다음과 같다.

- Github 초기 페이지에서부터 접속한 경우에, SPA 특성에 의해 변경되는 하위 특정 컴포넌트들만 변경된다.
- 따라서, 페이지가 새로고침이 되는 형태가 아니기 때문에 mainfest에 명시된 경로와 일치 여부를 확인할 수 없다.

&nbsp; 따라서, 이 문제를 기반으로 아래와 같은 해결책을 제시하였다.

- Github의 메인(하위 포함) 주소에 접속하였을 때부터 확장 프로그램이 동작하도록 하자.
- SPA의 특성에 의해 하위 컴포넌트만 변경될 경우, MutationObserver를 통해 이를 감지하여 콜백 함수를 실행하자.
- 콜백 함수 실행 시, 사용자가 변경사항 탭에 위치한 경우에만 Description 삽입 함수를 실행하자.

&nbsp; 위와 같은 해결책을 적용하기 위하여 위의 **content.js**에 <span class="code">MutationObserver</span> 객체와 콜백 함수를 정의하고, 이벤트 감지 DOM 요소를 `document.body`로 설정한 것이다.

&nbsp; 또한, "Github의 메인(하위 포함) 주소에 접속하였을 때부터 확장 프로그램이 동작하도록 하자"는 해결책을 실현하기 위하여 manifest.json에서 <span class="code">content_script</span> 부분을 다음과 같이 변경하였다.

```javascript
  "content_scripts": [
    {
      "matches": ["https://github.com/*"], // Github 루트 및 하위 url 포함
      "js": ["content.js"],
      "css": ["style.css"]
    }
  ]
```

&nbsp; 위와 같이 초기 매치 url 경로를 변경하게 되어 Github 홈페이지에 접속하였을 때부터 content.js에 실행된다. 

&nbsp; content.js가 실행되게 되면 MutationObserver에 의해 하위 요소의 변화를 감지하게 된다. 변화가 있을 때마다 당시 사용자의 경로를 확인해 Pull Request 변경 사항 페이지(`/files`)일 경우 PR Description 삽입 함수를 실행하게 된다.

# 결론

&nbsp; Github를 사용할 때 느낀 불편함에서부터 **Github Pull Requeset Helper** 크롬 확장 프로그램을 만들어보기로 결심하였다. 내가 불편하였던 부분을 해결하기 위해 직접 확장 프로그램을 만들어서 해결한 경험은 큰 성취감을 가지게 해주었다. 또한, 이 확장 프로그램이 [크롬 웹 스토어](https://chromewebstore.google.com/detail/github-pull-request-helpe/pllamjfnmnjelajmmklnldmpembdbcgi?hl=ko&utm_source=ext_sidebar)에 정식으로 올라가게 되었다는 것에 큰 기쁨을 느꼈다.

![chrome-web-store](/assets/img/docs/etc/github-pull-request-helper-v1/chrome-web-store.png)

&nbsp; 해당 프로젝트는 매우 간단한 PR Description 삽입 기능만 넣은채 출시를 하였지만, 이후 점진적으로 계속해서 추가 기능을 도입할 예정이다. 향후 Github Pull Request 사용 시 도움이 될만한 기능들을 제공하여 실제 사용자들이 만족감을 느낄만한 확장 프로그램으로 발전시켜 나가고 싶다.

&nbsp; 또한, 크롬 확장 프로그램 관련 포스팅이나 경험을 찾아보며 정말 다양한 인사이트를 얻을 수 있었다. 여러가지 문제점들을 해결하고, 기존에 존재하던 기능을 더욱 개선하는 등의 과정을 보며 문제를 탐색하는 새로운 시선을 얻게된 것 같다. 

&nbsp; 이후 여러가지 부가 기능을 더욱 추가하여 실제 사용자들의 만족도 높은 평가를 얻어보는 것을 목표로 프로젝트를 발전시켜나갈 계획이다.