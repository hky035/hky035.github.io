---
layout: posts
title:  "SpringBoot Relaxed Binding"
author_profile: true
sidbar:
  nav: "main"
category: "web"
description: "필자는 모의주식 투자 웹 프로젝트를 진행하며 한국투자증권 오픈 API를 사용하였다. 호출 유량 제한으로 인하여 여러 개의 인증키들을 등록해야할 소요가 발생하여 리스트 형태의 환경변수들을 바인딩하며 겪었던 문제 상황과 트러블 슈팅 과정을 나누고자 한다."
published: true
show_date: true
---

# 서론

&nbsp; 필자는 모의주식 투자 웹 프로젝트를 진행하며 [한국투자증권 오픈 API](https://apiportal.koreainvestment.com/intro)를 사용하였다.<br/>
한국투자증권 오픈 API의 경우, 호출 유량을 다음과 같이 제한하고 있다.

<img src="/assets/img/docs/web/env-binding/kis-request-limit.png" alt = "kis-request-limit.png" style="margin-bottom:15px;"/>

&nbsp; REST API 외에도 국내주식 실시간 체결가 웹소켓 연결이 필요하였다.   
한국투자증권의 경우 단일 세션 당 41건의 데이터 등록만 허용한다. 따라서, 국내주식 종목만 2700개 이상이므로 모든 종목을 다 연결하는 것에는 무리가 있었다.   
   
&nbsp; 최대한 많은 웹소켓 연결을 진행하려면 여러 개의 계좌 생성하여 해당 인증키(appkey, appsecret, websocketkey)들을 통하여 여러 세션을 연결하여야 한다.
   
&nbsp; 기타 프로젝트에서는 각기 다른 별도의 인증키를 적용한 서버를 구축하여 이를 로드밸런싱해서 사용하는 방식으로 해결한 것을 확인할 수 있었다.   
필자가 속한 팀에서는 단일 서버를 사용하기 때문에 <u>하나의 서버 내에서 여러 개의 인증키를 등록하여 세션을 연결</u> 해야 하였다.

&nbsp; 따라서, 리스트 형태의 환경변수를 등록하여 여러 개의 인증키들을 관리하고자 하였다.

---

# 문제 상황

```yaml
// applicaiton.yml
kis:
  domain: ${KIS_DOMAIN:domain}
  appkey:
  - ${KIS_APPKEY_1:appkey}
  - ${KIS_APPKEY_2:appkey}
  appsecret:
  - ${KIS_APPSECRET_1:appsecret}
  - ${KIS_APPSECRET_2:appsecret}
  web-socket-domain: ${KIS_WEBSOCKET_DOMAIN:domain}
```

```java
// KisProperties.java
@Component
@ConfigurationProperties(prefix = "kis")
@Getter
@Setter
@ToString
public class KisProperties {
    private String domain;
    private String webSocketDomain;
    private List<String> appkey;
    private List<String> appsecret;
    ...
}
```

```
// 환경변수
KIS_APPKEY_1=test
KIS_APPKEY_2=test
```
&nbsp; 해당 설정을 기반으로 애플리케이션을 실행하였을 때 아래와 같은 에러를 직면했다.

```
Description:

Binding to target [Bindable@651a3e01 type = java.util.List<java.lang.String>, value = 'provided', annotations = array<Annotation>[[empty]], bindMethod = [null]] failed:

    Property: kis.appkey[1]
    Value: "test"
    Origin: System Environment Property "KIS_APPKEY_1"
    Reason: The elements [kis.appkey[1],kis.appkey[2]] were left unbound.
    Property: kis.appkey[2]
    Value: "test"
    Origin: System Environment Property "KIS_APPKEY_2"
    Reason: The elements [kis.appkey[1],kis.appkey[2]] were left unbound.

Action:

Update your application's configuration
```

&nbsp; 에러 문구는 `List<String>` 포맷의 속성에 바인딩할 수 없다는 내용이다.

&nbsp; 필자는 처음에 _application.yml_ → _KisProperties_ 로 값이 바인딩되기 때문에 yaml 파일에서 리스트 선언 방식에 문제가 있다고 생각하였다. yaml 파일에서 리스트 표현 방식은 하이픈(-)이나 콤마(,)를 구분자로 하여 값을 기입하여야 한다. 따라서, 리스트 선언 방식에 문제가 있는 것은 아니었다. 

&nbsp; 또한, 해당 에러 문구에서 인덱스가 `kis.appkey[0]`이 아닌 `kis.appkey[1]`로 시작하고 있다. 바인딩 과정에서 생긴 문제를 해결하기 위하여 yaml 파일 내 값들을 계속 수정해보았지만 결과는 똑같았다.

&nbsp; 기타 프로젝트(SpringBoot 3.4.3)에서 동일한 세팅으로 실행하였을 때 정상적으로 실행되었기 때문에 해당 문제가 SpringBoot 3.4.0에서 발생하는 버그라고 생각하여 SpringBoot 깃허브 내 [이슈](https://github.com/spring-projects/spring-boot/issues/44508)로 질문을 가장한 버그 제보를 하였다. 그러나, 다른 개발자 분의 답변을 통하여 버전 상관없이 에러가 발생하는 것을 알 수 있었다. 공식문서를 참고하였을 때 환경변수 바인딩 관련하여 두 버전 간 차이가 없었기에 어쩌면 당연한 결과였다.

&nbsp; 따라서, yaml 파일만의 문제가 아니라고 생각하여 환경변수명을 다음과 같이 바꾸어 실행해보았을 때 정상적으로 실행이 되었다.

```
KIS_APPKEY_0=test
KIS_APPKEY_1=test
```

&nbsp; 성공적인 결과를 마주하였을 때 _**"환경변수명이 어떻게 스프링 애플리케이션 내 리스트 바인딩에까지 영향을 미치지?"**_ 라는 의문이 들었다.
해당 문제를 알아보기 위하여 공식문서에 환경변수 관련 부분을 다시 정독하였다.

&nbsp; 결과적으로 해당 문제는 <a href="https://docs.spring.io/spring-boot/3.3/reference/features/external-config.html#features.external-config.typesafe-configuration-properties.relaxed-binding">Relaxed Binding</a> 로 인해 발생하였다는 것을 알 수 있었다.

# Relaxed Binding

&nbsp; SpringBoot에서 `@ConfigurationProperties` 어노테이션 사용 시 Relaxed Binding을 통하여 환경변수를 주입받는다.
필자는 기존에 **환경변수 → yaml → Property Class** 로 바인딩이 진행된다고만 생각하였다. 

> `@Value` 어노테이션 사용 시 해당 설명이 기본적으로 맞다.

&nbsp;  Relaxed Bindng 사용 시 4가지 Property Source로부터 환경변수를 바인딩받는다.

- Properties Files
- YAML Files
- Environment Variables 
- System Properties

&nbsp; 즉, 앞서 설명한 **환경변수 → yaml → Property Class** 외에도 **환경변수 → Property Class**로 바로 바인딩이 가능하다.
applicaiton.yml과 환경변수로부터 각 값들이 바인딩되어 `KisProperties`의 필드값에 대응된다. 따라서, 아래의 모든 값들은 동일한 환경변수를 나타낸다고 할 수 있다.

```yaml
# application.yml
kis:
  appkey:
```

```
// environment variable
KIS_APPKEY=
```

&nbsp; `@ConfigurationProperties(prefix = "kis")` 어노테이션을 사용하였기에, 각 필드명에 해당하는 환경변수들을 application.yml과 Environment variable에서 바인딩하는 과정에서 `KIS_APPKEY_1`과 `KIS_APPKEY_2`가 `kis.appkey[1]`, `kis.appkey[2]` 로 해석된 것이다.

&nbsp; Relaxed Binding을 실험해보기 위해 application.yml 내 설정값을 지운 다음 실행해보았다.

```yaml
// applicaiton.yml
kis:
  domain: ${KIS_DOMAIN:domain}
  web-socket-domain: ${KIS_WEBSOCKET_DOMAIN:domain}
```

```
KIS_APPKEY_0=test
KIS_APPKEY_1=test
```

&nbsp; 결과는 성공이었다. 따라서, Relaxed Binding으로 인하여 application.yml 파일 뿐만 아니라 환경변수로 부터 직접 값을 주입받고 있어 인덱스 문제로 인한 바인딩 에러가 발생한 것이다.

&nbsp; 그러나 필자는 여전히 의문이 남는 것이 있다. 스프링부트 [공식문서](https://docs.spring.io/spring-boot/3.3/reference/features/external-config.html#features.external-config.typesafe-configuration-properties.relaxed-binding.environment-variables)에 따르면 <u>List 형태로 바인딩하기 위하여 언더스코어(_)로 숫자를 감싸야만 한다</u>고 명시되어 있다.

> **"Environment variables can also be used when binding to object lists. To bind to a List, the element number should be surrounded with underscores in the variable name."**   
\- SpringBoot 3.4.3 documentation

&nbsp; 환경변수 이름이 **\_0**로 마무리될 경우 이를 **\_0\_**와 동일하게 인덱스로 인식하는 것으로 추측된다.

# @ConfigurationProperties vs @Value

&nbsp; 그렇다면 정확한 바인딩을 위해서 `@Value` 어노테이션을 사용하는 것이 좋을까? 이또한, 스프링 공식문서에서 기제되어 있는 내용이다.
만약 컴포넌트(애플리케이션)에서 설정키 set을 정의한 경우에는 `@ConfigurationProperties` 사용을 권장한다고 한다.

&nbsp; 물론 `@Value` 어노테이션을 사용해도 값을 바인딩받을 수 있기는 하지만 `@Value`의 경우에는 <tip-tag content="Spring Expression Language">SpEL</tip-tag>를 사용함으로 인해 리스트 형태의 값을 받아올 경우 `kis.appkey[0]`, `kis.appkey[1]`과 같이 단일 인덱스를 기준으로 들고와야한다.   
또한, 설정값의 깊이(중첩)가 깊은 경우나 코드 중복 발생 가능성, Relaxed Binding 등의 이유로 `@Value` 어노테이션보다는 `@ConfigurationProperties` 적용이 권장된다.

&nbsp; 두 어노테이션 사용에 있어 설정값과 클래스 구조에 대한 판단에 따라 유연한 적용이 가능할 것으로 보인다.

# 리스트 형태의 환경변수 바인딩

&nbsp; 위 과정을 통해 바인딩 오류를 해결하였긴 하였지만, 리스트 형태의 환경변수 값 바인딩 시 여전히 고려사항이 남아있다.
리스트 형태의 값의 경우, 환경변수명과 프로퍼티 클래스의 필드명의 중복을 피해야하며 중복 시 인덱스 여부를 고려하여 할당하여야 한다.

&nbsp; 필자는 이러한 고려사항을 염두하고 환경변수를 설정하기에는 부담이 있다고 생각하여 다른 방법을 생각해보았다.

&nbsp; 결론부터 이야기하면, <u>환경변수 할당 시에 콤마(,) 값을 나열하여 할당</u>하는 방식으로 단일 환경변수명에 리스트 형태의 데이터를 전달할 수 있었다.

```java
// KisProperties.java
@Component
@ConfigurationProperties(prefix = "kis")
@Getter
@Setter
@ToString
public class KisProperties {
    private String domain;
    private String webSocketDomain;
    private List<String> appkey;
    private List<String> appsecret;
    ...
}
```

```
KIS_APP_KEY=test1, test2
KIS_APP_SECRET=test1, test2
```

&nbsp; 위와 같이 설정한 경우, 사용자가 인덱스를 지정하는 일이 발생하지 않아 바인딩 에러가 발생하지 않는다. 또한, 하나의 환경변수명에 여러 값들을 나열해 적으면 되기 때문에 필요한 값의 수 만큼 환경변수를 추가할 소요도 줄어든다.

&nbsp; 추가적으로 해당 경우에도 Relaxed Binding을 사용하기 때문에 applicaiton.yml에 설정값을 적어도 무방하다. 가독성과 보안성을 고려하여 application.yml에 환경변수를 적용하는 것은 사용자의 몫이다.

# \# Reference
- [SpringBoot 3.4.3 - Externalized Configuration: Relaxed Binding](https://docs.spring.io/spring-boot/3.3/reference/features/external-config.html#features.external-config.typesafe-configuration-properties.relaxed-binding.environment-variables)
- [SpringBoot 3.4.3 - Externalized Configuration: @ConfigurationProperties vs @Value](https://docs.spring.io/spring-boot/3.3/reference/features/external-config.html#features.external-config.typesafe-configuration-properties.vs-value-annotation)