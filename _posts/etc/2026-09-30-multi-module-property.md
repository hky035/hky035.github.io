---
layout: posts
title: 'SpringBoot 멀티 모듈 환경에서 프로퍼티 설정하기'
author_profile: true
sidbar:
   nav: 'main'
category: 'etc'
description: "최근 교내 정보 큐레이션 서비스를 개발하며 모놀리식 멀티 모듈 아키텍처를 적용하여 백엔드를 구현하고 있다. 모듈별 프로퍼티는 각 모듈 내 프로퍼티 파일을 두고 필요한 값을 작성하여 관리한다. 모놀리식 단일 모듈에서의 application.yml, application-dev.yml, application-production.yml을 사용하던 방식을 멀티 모듈에서는 어떻게 적용시키는 가에 관한 의문이 들었다. 이번 프로젝트를 진행하며 멀티 모듈 구조와 설정에 대해 깊이 학습을 진행하며 알아본 프로퍼티 설정 방법들과 주의 사항을 공유하고자 한다."
published: true
show_date: true
---

# \# 서론 

&nbsp; 최근 교내 정보 큐레이션 서비스를 개발하며 모놀리식 멀티 모듈 구조를 도입하여 새로운 아키텍처를 경험하고 공부하고 있다. 

&nbsp; 이번 프로젝트에서는 도메인별로 모듈을 나누어 각각 독립된 서비스로 운영하는 구조보다 하나의 애플리케이션으로 운영하는 구조가 적합하다고 판단하였다. 또한 기존 프로젝트에서 레이어드 아키텍처를 사용한 경험을 바탕으로 **레이어 단위 멀티 모듈 구조**를 선택했다. `domain`, `application`, `apis`, `infrastructure`, `persistence`, `boot` 등 각 레이어를 모듈로 나누었다.

&nbsp; 그 중 infrastructure 모듈은 외부 인프라와 통신을 담당하고, Usecase가 사용하는 Port를 구현한다. 또한, persistence 모듈은 엔티티의 영속화를 담당하는 모듈로 JPA를 통해 데이터베이스와 통신한다. 특히 두 모듈의 외부 인프라와의 연결 등이 필요하며, 연결과 설정에 필요한 값은 프로퍼티 파일을 통해 바인딩한다.

&nbsp; 그러던 도중, _"멀티 모듈에서는 프로퍼티 파일을 어떻게 위치시키지?"_ 라는 의문이 들었고, 기존 단일 모듈에서 `application-{profile}.yml` 방식의 프로퍼티 파일을 사용하던 것을 그대로 적용하는 것에 대한 의문이 들었다. 이에 대한 해답은 [카카오페이 기술블로그 - Spring 기반 멀티모듈 프로젝트 환경변수 설정 방법](https://tech.kakaopay.com/post/spring-multi-module-environment-variable/)에서 얻을 수 있었다. 

&nbsp; 이 과정에서 학습한 멀티 모듈에서 프로퍼티 설정 방법 종류와 각 종류마다 장단점 등을 알아보고, 필자가 한 선택과 주의사항에 대해 배운 것을 정리하고자 한다.

# \# 본론

## 멀티 모듈에서 프로퍼티 설정에 대한 의문

&nbsp; 기존 진행하던 프로젝트는 모놀리식 단일 모듈 구조로 이루어져 있어 메인 설정 파일 `application.yml`과 프로필 별 설정 파일 `application-dev.yml`, `application-prod.yml`을 사용하여 프로퍼티를 관리하였다. 단일 모듈이었기에 하나의 프로퍼티 파일에 모든 값을 관리하고 주석을 통해 구분짓는 것으로 프로퍼티를 분리하였기에 관리에 어려움은 없었다.

&nbsp; 그러나, 멀티 모듈 구조를 도입하며 프로퍼티 파일도 각 모듈에 위치해야했다. 도메인별 모듈을 나눈 구조라면 기존 단일 모듈에서의 프로퍼티 설정처럼 실행 모듈에 프로퍼티 파일을 위치시켜 값을 바인딩할 수도 있을 것이다. 하지만 필자는 계층별 모듈을 나눈 구조였기에 특정 모듈에서 사용하는 프로퍼티를 실행 모듈인 `boot`에 모두 잓 ㅓㅇ하면 설정의 책임이 실제 사용 모듈과 분리되고, 실행 모듈에 설정이 집중될 수 있다고 생각했다. 

&nbsp; 따라서, SpringBoot 멀티 모듈 구조에서 적절한 프로퍼티 설정 방법을 찾아보던 중 [카카오 페이 기술 블로그 - Spring 기반 멀티모듈 프로젝트 환경변수 설정 방법](https://tech.kakaopay.com/post/spring-multi-module-environment-variable/) 포스팅을 보게 되었다. 결론적으로는 해당 글에서 멀티 모듈에서 여러 프로퍼티 설정 방법들을 알 수 있었다.

## 프로퍼티 설정 방법

&nbsp; 이 글에서 살펴볼 대표적인 프로퍼티 설정 방법은 다음 4가지다.

- `spring.config.import` 사용하기
- `spring.profiles.include` 사용하기
- `@PropertySource` 사용하기
- `@Profile` + `@PropertySource` 사용하기

&nbsp; 참고한 포스팅과 마찬가지로 필자로 `@Profile` + `@PropertySource`를 함께 사용하는 방식을 선택했다. 

### 1. `spring.config.import` 사용하기

&nbsp; `spring.config.import`는 다른 모듈의 프로퍼티 파일의 경로를 직접 명시하여 설정을 들고오는 방법이다.

&nbsp; 예를 들어, `infrastructure-default.yml` 프로퍼티 파일이 존재한다면 실행 모듈의 `application.yml`에서 아래와 같이 불러올 수 있다.

```yml
# 실행 모듈의 application.yml
spring:
  config:
    import:
      - 'classpath:infrastructure-default.yml'
```

&nbsp; 해당 방식은 실행 모듈의 `application.yml` 파일에 직접 타 모듈의 프로퍼티 파일의 경로를 명시해야하기 때문에, 모듈 개발 팀이 다른 경우 이를 직접 명시하는 것에 대한 번거로움이 존재한다. 또한, 타 모듈이 늘어나면 늘어날수록 경로 누락 등의 위험성도 증가하게 된다.

### 2. `spring.profiles.include` 사용하기

&nbsp; 단일 모듈에서 `application-{profile}.yml`로 프로필별 불러올 프로퍼티 파일을 정할 수 있었던 것처럼 이를 멀티 모듈에 적용하는 것이다. `{profile}` 부분을 특정 모듈의 설정 파일을 나타내는 이름으로 설정하여 이를 실행 모듈에서 `include` 하는 방법이다.

&nbsp; 예를 들어, `infrastructure` 모듈의 프로퍼티 파일이 `application-infra.yml`과 같이 정의되어있다면, 이는 `{profile} = infra`인 것과 같다. 따라서, 실행 모듈에서 해당 프로필을 `include`해 프로퍼티 파일을 불러온다.

```yml
# 실행 모듈의 application.yml
spring:
  profiles:
    include: infra
```

&nbsp; 이 방법은 `spring.config.import` 방식처럼 실행 모듈에서 다른 모듈의 프로퍼티 파일명을 알고있어야 된다는 점이 동일한 문제점으로 작용한다. 또한, SpringBoot의 [External Config - Profile Specific Files](https://docs.spring.io/spring-boot/reference/features/external-config.html#features.external-config.files.profile-specific) 공식 문서에 나와있듯이 Spring Profile은 특정 환경이나 조건에 따라 설정과 빈 구성을 분리하기 위한 기능이다. 그러나, 이것을 모듈 이름 등으로 설정하여 우회적으로 프로퍼티를 등록시키는 방법이 그렇게 좋은 해결책인가는 의문이 든다.

### 3. `@PropertySource` 사용하기

&nbsp; `@PropertySource` 어노테이션은 `value` 옵션에 명시한 프로퍼티(`.properties`) 파일의 내용이 프로퍼티로 등록될 수 있도록 하는 어노테이션이다.

> `@PropertySource`는  기본적으로 `.xml`, `.properties` 파일만 읽을 수 있다.

&nbsp; 예를 들어 `infrastructure` 모듈에 `infrastructure/default.properties` 프로퍼티 파일이 존재한다면, `infrastructure` 모듈에 다음과 같은 설정 클래스를 등록해 프로퍼티 파일을 불러올 수 있다.

```java
// infrastructure 모듈

@Configuration
@PropertySource(value = "infrastructure/default.properties")
public class DefaultConfig { }
```

&nbsp; 이전 방식들은 각 모듈에 프로퍼티 파일을 작성하고 실행 모듈에서 이를 불러오는 방식이었다면, `@PropertySource`는 해당 설정 클래스가 컴포넌트 스캔의 대상이 되면, 모듈 내부에서 프로퍼티를 등록할 수 있게 된다.

&nbsp; 해당 프로젝트에서 실행 모듈이 각 계층의 모듈을 모두 의존하고 실행한다. 따라서, `@PropertySource`로 프로퍼티를 등록할 수 있다.

### 4. `@Profile` + `@PropertySource` 사용하기

&nbsp; 앞서 `@PropertySource`만 사용하는 방식은 프로필과 상관없이 항상 프로퍼티를 등록하게 된다. 그러나, 각 모듈에서도 프로퍼티가 프로필에 따라 달라져야하는 경우가 있다. 이 경우에 `@Profile` 어노테이션과 결합하여 특정 프로필별로 프로퍼티 파일을 가지고 올 수 있다.

```java
// infrastructure 모듈
public class InfrastructureProfileConfig {
    @Configuration
    @PropertySource(value = "infrastructure/default.properties")
    public static class DefaultConfig { }

    @Configuration
    @Profile("develop")
    @PropertySource(value = "infrastructure/develop.properties") 
    /* 
        @PropertySource(value = {
            "infrastructure/default.properties", 
            "infrastructure/develop.properties
        })
    */
    public static class DevelopConfig { }

    @Configuration
    @Profile("production")
    @PropertySource(value = "infrastructure/production.properties")
    public static class ProductionConfig { }
}
```

&nbsp; 이처럼 `@PropertySource`를 활용하면서도 각 프로필마다 불러오는 프로퍼티 파일을 다르게 설정하여 유지보수시 수정할 파일을 명확히 나타낼 수 있다.

&nbsp; 그러나, 해당 방법이 좋아보이긴 하였지만 몇 가지 의문이 들기도 하였다.

#### Q. properties 파일을 사용하는 것이 괜찮은 방법인가?

&nbsp; 필자는 프로퍼티 설정 시 .yaml 파일 사용이 익숙하였기에 .properties를 사용해야하는 것이 과연 괜찮은 방식인지 의문이 들었다.

&nbsp; 그러나, 두 형식 모두 최종적으로 Spring Enviromnent에 키-값 형태로 등록된다. 다만 YAML은 계층 구조와 목록을 표현하기 쉽고, properties는 평탄한 키 구조라 값을 명시적으로 확기 쉽다는 차이가 있어 선택의 영역이라 생각하게 되었다.

&nbsp; 그리고 돌이켜보면 yaml 파일 사용 시, 프로퍼티 코드 중복 등을 줄일 수는 있지만 가독성이 오히려 저하되거나 들여쓰기가 맞지 않을 경우 엉뚱한 값이 바인딩 되어버리는 등 문제도 존재하였기에 오히려 직관적으로 프로퍼티를 명시할 수 있는 properties 파일 사용도 괜찮은 선택지같다는 생각이 들었다.

#### Q. properties 말고 yaml을 사용하는 방법이 있나?

&nbsp; properties 사용을 선택하기는 하였지만 `@PropertySource`도 결국 파일을 읽는 작업인데 yaml 확장자 파일을 읽는 방법이 있지 않을까는 생각에 yaml 파일 사용 방법을 찾아보았다. 

&nbsp; Spring의 [PropertySourceFactory.createPropertySource()](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/core/io/support/PropertySourceFactory.html#createPropertySource(java.lang.String,org.springframework.core.io.support.EncodedResource))를 구현하고 `@PropertySource`의 `factory` 옵션을 통해 구현한 팩토리를 지정하여 yaml 파일을 읽게 만들 수 있었다.

&nbsp; 그러나 해당 방식은 결국 `PropertySourceFactory`를 구현하여야하였기에 이를 `common` 모듈에 배치시키거나 각 모듈마다 구현하여야 하였다. 그러나, `common` 모듈은 순수 Java로만 작성된 `domain` 모듈이 의존하고 있기에 Spring 의존성을 `common` 모듈에 추가하는 것은 좋지 못한 판단이라고 생각하였다. 또한, 각 모듈마다 `PropertySourceFactory`를 구현하거나 `common` 말고 별도의 공통 모듈을 만드는 것또한 그리 좋은 방법같지는 않았다.

#### Q. 왜 프로퍼티 파일을 한 단계 더 아래에 두는가?

&nbsp; Spring Boot 프로젝트에서는 일반적으로 `application.properties`, `appication.yml`을 `/src/main/resources/`에 둔다. 그러나, 카카오페이 포스팅을 읽으면서 `classpath:transfer-client/property-source-default.properties`와 같이 모듈명과 동일한 디렉토리를 만들고 한단계 아래 프로퍼티 파일을 만드는 것을 알 수 있었다.

&nbsp; 처음에는 굳이 디렉토리를 만드는 이유가 궁금하였지만, 멀티 모듈 구조를 다시 생각해보니 <u>각 모듈마다 프로퍼티 파일명이 동일한 상황</u>이 흔하고, 디렉토리로 파일 경로를 구분하지 않는다면 동일한 클래스패스 경로에 같은 이름의 리소스가 여러 개 존재하면, 어떤 파일이 조회되는지 클래스패스 순서에 따라 바뀌게 될 수 있다. 즉, 동일한 파일 경로에 의해 클래스패스에서 구분이 힘들어지고 충돌이 일어나는 등의 상황이 발생할 수 있게 된다.

&nbsp; 물론 `infrastructure-default.properties`, `infrastructure-develop.properties`와 같이 파일명에 해당 모듈을 넣을 수도 있겠지만 모듈이 많아지고, 파일 경로에 중복 단어가 많이 식별의 어려움이 존재한다고 느꼈다.

#### Q. 프로퍼티 파일을 하드 코딩하는 것이 괜찮은가?

&nbsp; 코드에 프로퍼티 파일 경로가 하드 코딩되어 있다는 점이 경계스러웠다. 

&nbsp; 다른 모듈에서 프로퍼티 파일을 불러오지는 않지만, 그렇다고 해서 해당 모듈에 프로퍼티 파일 경로를 명시하는 것이 과연 괜찮은지에 대한 의문이 들었다.

&nbsp; 이에 관해 자세히 생각해보니 결국 '같은 모듈' 안에 존재하는 프로퍼티 파일이고, 파일 경로는 변경될 일이 드물기에 하드 코딩되어도 문제가 없으며, 오히려 하드 코딩되어 경로를 명시하는 것이 유지보수 시 수정 대상 파일을 명확히 할 수 있다고도 생각이 들었다.

## `@PropertySource`를 항상 사용할 수 있는 것은 아니다.

&nbsp; 포스팅을 참고하여 `@Profile` + `@PropertySource` 방식을 적용하기를 선택한 후, 포스팅에 달린 댓글을 읽던 중 아래와 같은 내용을 확인할 수 있었다.

![comment](/assets/img/docs/etc/multi-module-property/comment.png)

&nbsp; `@PropertySource`가 지연 로딩으로 동작한다는 것이다.

> 지연 로딩은 해당 댓글에서 지칭한 표현일 뿐, 실제 공식 문서와는 다르다.

&nbsp; 이에 관해 공식 문서를 찾아보니 처음부터 이와 관련된 내용이 명시되어 있었다.

![property-source-docs](/assets/img/docs/etc/multi-module-property/property-source-docs.png)

&nbsp; `@PropertySource` 어노테이션 사용 시 Application Context가 Refresh 될 때까지 환경 변수를 추가하지 않는 다는 것이다. 따라서, 설정하는데 너무 늦기 때문에 `logging.*`, `spring.main.*`과 같은 프로퍼티를 설정하는데 `@PropertySource`는 너무 늦다는 것이다.

&nbsp; 어찌보면 당연한 이야기지만, `@PropertySource`가 Application Context가 Refresh 되기 이전에 필요한 설정에는 사용할 수 없다는 사실을 댓글을 통해 알게되었다.

&nbsp; 따라서, `logging.*`나 `spring.main.*` 설정은 `application-{profile}.properties`에 설정하여 Application Context 갱신이 시작되기 전에 로드되로록 해야한다.

&nbsp; 필자또한 hibernate SQL 로깅을 위해 실행 모듈의 `application-develop.properties` 프로퍼티 파일에 로깅 프로퍼티를 정의하였다.

```properties
# boot 모듈의 application-develop.properties

logging.level.org.hibernate.SQL=debug
```

# \# 결론

&nbsp; 해당 포스팅을 작성한 카카오페이 파트너플랫폼 파티와 필자도 `@Profile` + `@PropertySource` 방식을 선택하였지만 해당 방법의 정답은 없다고 생각한다. proeprties 형식을 기본적으로 사용해야 한다는 제약과 모듈별 프로퍼티 설정 클래스를 도입하고, 경로를 하드코딩 하는 등 각 방법의 트레이드오프에 관한 견해 차이가 존재할 것이라 생각한다. 따라서, 이 부분은 팀과 소통을 통해 컨벤션을 맞추고 유지하는 것이 매우 중요하다고 느꼈다. 