---
layout: posts
title: 'SpringBoot 멀티 모듈에서 파라미터 컴파일 옵션 설정'
author_profile: true
sidbar:
   nav: 'main'
category: 'etc'
description: "최근 교내 정보 큐레이션 서비스를 개발하며 모놀리식 멀티 모듈 아키텍처를 적용하여 백엔드를 구현하고 있다. 모듈별 프로퍼티는 각 모듈 내 프로퍼티 파일을 두고 필요한 값을 작성하여 관리한다. JWT 관련 프로퍼티를 설정하고 생성자 바인딩 방식을 사용하였을 때 애플리케이션 실행에 실패하였다. 멀티 모듈에서 해당 문제 발생의 원인과 해결책을 알아본 경험을 정리해보고자 한다."
published: true
show_date: true
---

# \# 서론

## 문제 상황

&nbsp; 최근 교내 정보 큐레이션 서비스를 개발하며 모놀리식 멀티 모듈 아키텍처를 적용하여 백엔드를 구현하고 있다. 모듈별 프로퍼티는 각 모듈 내 프로퍼티 파일을 두고 필요한 값을 작성하여 관리한다. 따라서, 하위 모듈은 infrastructure 모듈에서 사용되는 JWT 관련 기능을 위해 `JwtProperties`를 정의하여 프로퍼티를 바인딩 받았다.

&nbsp; 그러나 애플리케이션 실행 시 아래와 같은 에러를 마주하였다.

![error-log](/assets/img/docs/etc/multi-module-parameters-compile-options/error.png)

&nbsp; 에러 로그에서 알 수 있듯이 `JwtProperties` 클래스에 프로퍼티 `jwt` 바인딩에 실패하였다.

&nbsp; 에러 로그에서 제시한 해결 방법은 **컴파일러가 `-parameters` 플래그를 사용하도록 설정**하는 것을 제시하고 있다. 

&nbsp; Intelij IDE에서 해당 플래그를 설정하니 단기적으로 실행이 되기는 하였지만, IDE에서 실행하지 않는다면 여전히 에러가 발생하고 별도로 `-parameters` 옵션을 설정하여야 하였다. 

&nbsp; 해당 문제의 원인이 무엇인지, `-parameters` 옵션은 어떠한 설정이기에 해당 문제를 해결할 수 있는지 궁금하여 이에 관해 찾아보았다.

# \# 본론 

## 문제 원인: 생성자 바인딩

&nbsp; 애플리케이션 실행 실패의 원인인 `JwtProperties`는 다음과 같다.

```java
@Getter
@ConfigurationProperties(prefix = "jwt")
public class JwtProperties {
    private final SecretKey secretKey;
    private final String issuer;
    private final Duration accessTokenExpiration;
    private final Duration refreshTokenExpiration;
    
    public JwtProperties(
            String key,
            String issuer,
            Duration accessTokenExpiration,
            Duration refreshTokenExpiration
    ) {
        this.secretKey = Keys.hmacShaKeyFor(Decoders.BASE64URL.decode(key));
        this.issuer = issuer;
        this.accessTokenExpiration = accessTokenExpiration;
        this.refreshTokenExpiration = refreshTokenExpiration;
    }
}
```

&nbsp; `JwtProperties`는 **'생성자 바인딩'** 방식을 사용하고 있다.

&nbsp; 기존에는 `@Component` + `@Getter/@Setter` + `@ConfigurationProperties` 방식을 사용해서 **Setter 바인딩** 방식으로 프로퍼티를 바인딩받았다면, 이번 프로젝트에서는 프로퍼티의 불변성을 보장하고자 필드를 `final`로 설정하고 생성자 바인딩 방식을 사용하고자 하였다.

&nbsp; 또한, SpringBoot 는 `@ConfigurationProperties` 타입으로 구조화 하는 방식을 권장한다. 또한, [공식 문서](https://docs.spring.io/spring-boot/reference/features/external-config.html#features.external-config.typesafe-configuration-properties.enabling-annotated-types)에서는 프로퍼티를 바인딩 받는 클래스의 등록은 `@ConfigurationPropertiesScan` 또는 `@EnableConfigurationProperties`를 사용할 수 있다. 

&nbsp; `@ConfigurationPropertiesScan` 방식은 주로 `@SpringBootApplication`에 붙여 자동으로 다른 클래스들이 스캔 범위에 포함되도록 하거나, `@Configuration` 어노테이션과 같이 사용하여 스캔 경로를 명시적으로 추가할 수 있다.

&nbsp; `@EnableConfigurationProperties`는 자동 설정(Auto Configuration) 기능을 직접 구현하거나, 명시적으로 프로퍼티 클래스를 나타낼 때 사용한다.

&nbsp; 멀티 모듈 구조에서 실행 모듈에 `@ConfigurationPropertiesScan`을 붙여 프로퍼티를 스캔하는 방식보다, 각 모듈에서 `@EnableConfigurationProperties`를 정의하는 것이 더 나은 구조라고 판단하여 필자는 후자를 선택하였다.

```java
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(JwtProperties.class)
public class JwtConfig {
}
```

&nbsp; 위 구현에서 문제의 핵심 원인은 **생성자 바인딩**을 사용해 프로퍼티를 바인딩 받는 것이다.

### Setter 바인딩 방식의 동작

&nbsp; 만약, Setter 바인딩 방식을 사용한다면 `setIssuer()`, `setKey()` 등 메서드명에 명시적으로 바인딩받을 프로퍼티명이 명시되어있다.

&nbsp; 메서드명은 <u>컴파일 시에도 유지되어 클래스파일에서도 인식 가능</u>하다.

### 생성자 바인딩 방식의 동작

&nbsp; 생성자 바인딩 방식은 다음과 같이 생성자의 인자를 통해 프로퍼티를 바인딩 받게 된다.

```java
// JwtProperties.java

public JwtProperties(String key, String issuer, ...) { 
    // ...
}
```

&nbsp; 그러나, <u>생성자는 컴파일 시 기본적으로 파라미터명이 사라지고 타입만 남게 된다</u>.

```java
// JwtProperties.class

public JwtProperties(String arg0, String arg1, ...) { 
    // ...
}
```

&nbsp; 따라서, 생성자의 인자 파라미터명이 사라져 바인딩할 값을 찾지 못하게 되는 것이다.

&nbsp; `@ConfigurationProperties(prefix = "jwt")`를 통해 `jwt` 접두사로 시작하는 프로퍼티 바인딩을 시도하지만, 클래스 파일은 생성자의 파라미터명이 없기 때문에 `jwt.key`, `jwt.issuer` 등 이후 프로퍼티를 바인딩할 변수를 찾지 못하게 되는 것이다.

## 해결 방법: `-parameters` 컴파일 옵션

&nbsp; 해당 문제의 해결 방법은 **클래스 파일에서도 파라미터명을 유지**시키는 것이다.

&nbsp; 컴파일 후 클래스 파일에서도 파라미터명을 유지시키는 방법이 `-parameters` 컴파일 옵션을 설정하여 컴파일을 진행하는 것이다.

&nbsp; [SpringBoot 공식 문서 - Constructor Binding](https://docs.spring.io/spring-boot/reference/features/external-config.html#features.external-config.typesafe-configuration-properties.constructor-binding)에서도 _"Constructor Binding 사용 시 반드시 `-parameters` 옵션을 사용해 컴파일을 진행하라"_ 라고 명시되어있다.

<a id="constructor-binding-docs"></a>

![constructor-binding-docs](/assets/img/docs/etc/multi-module-parameters-compile-options/constructor-binding-docs.png)

&nbsp; 따라서, 컴파일 시 `-parameters` 옵션을 통해 컴파일을 진행하면 생성자의 파라미터명이 클래스 파일에 포함되게 되면서 생성자를 통한 바인딩이 문제없이 진행된다.

### 생성자 바인딩 방식 자체가 문제인가?

&nbsp; 근본적인 원인은 생성자 바인딩 방식 사용시 컴파일 과정에서 파라미터명이 생략되는 것이긴 하다.

&nbsp; 그러나, 이번 프로젝트에서 '생성자 바인딩'과 '멀티 모듈' 두 가지를 동시에 적용시켰기 때문에 단순히 생성자 바인딩 방식을 사용해서만 발생하는 문제인지 궁금하였다.

&nbsp; 따라서, 간단한 단일 모듈 토이 프로젝트를 만들어서 생성자 바인딩 방식으로 애플리케이션을 실행해보았다. 실행 결과 <u>문제 없이 실행</u>되었다.

&nbsp; 이는 _"단일 모듈에서는 생성자 바인딩 방식을 써도 왜 문제가 발생하지 않는가?"_ 라는 의문으로 이어졌다.

### SpringBoot Gradle 플러그인을 통한 문제 해결

&nbsp; 앞선 [공식 문서](#constructor-binding-docs)에서도 나와있듯이 'Spring Boot Gradle 플러그인' 또는 'Maven and `spring-boot-starter-parent`'를 사용하면 자동으로 `-parameters` 컴파일 옵션이 추가된다고 명시되어 있다.

&nbsp; 따라서, **단일 모듈일 때 생성자 바인딩을 써도 문제가 발생하지 않았던 이유는 SpringBoot 사용시 기본적으로 Spring Boot Gradle** 플러그인을 추가하기 때문이다.

```groovy
plugins {
    id 'java'
    id 'org.springframework.boot' version '4.1.1' apply false
    id 'io.spring.dependency-management' version '1.1.7' apply false
}
```

### 현재 멀티 모듈 프로젝트에서 Spring Boot Gradle 플러그인 설정

&nbsp; 그렇다면, 해당 프로젝트(멀티 모듈)에서는 Spring Boot Gradle 플러그인이 어떻게 설정되어있을까?

```groovy
// root 경로의 build.gradle

plugins {
    id 'java'
    id 'org.springframework.boot' version '4.1.1' apply false
    id 'io.spring.dependency-management' version '1.1.7' apply false
}


subprojects {
    apply plugin: 'java'
    apply plugin: 'io.spring.dependency-management'

    // ...
}
```

&nbsp; root 경로의 `build.gradle`에서는 최상위 모듈에는 Spring Boot Gradle 플러그인의 버전만 명시되어있고, 루트·하위 모듈에는 적용하지 않고 있다.

&nbsp; 이는 Spring Boot Gradle 플러그인은 단순히 `-parameters` 컴파일 옵션만을 추가하는 것이 아니라 실행을 위한 bootJar 모듈 생성 등 다양한 작업을 수행하기 때문에 Spring Boot Gradle 플러그인을 루트·하위 모듈에 적용시키지 않고 있다.

> 애플리케이션 실행을 위한 `boot` 모듈에는 Spring Boot Gradle 플러그인을 별도로 설정하였다.

&nbsp; 즉, 내 프로젝트에서는 실행 모듈을 제외한 모든 모듈에 Spring Boot Gradle 플러그인이 적용되지 않았기에 `-parameters` 컴파일 옵션이 적용되지 않아 생성자 바인딩이 실패하게 된 것이다.

### 하위 모듈의 `-parameters` 옵션을 추가

&nbsp; Spring Boot Gradle 플러그인은 `-parameters` 컴파일 옵션 설정 외에도 bootJar 작업 등 다른 작업도 많이 포함되어 있기 때문에 하위 모듈에 Spring Boot Gradle 플러그인을 모두 적용시키는 것은 정확한 해결 방법은 아니다. 물론, Spring Boot Gradle 플러그인 적용 후 `bootJar` 태스크가 실행이 되지 않도록 설정할 수도 있겠지만 모든 모듈에 이러한 설정을 추가하는 것은 좋지 못한 해결 방법이라 생각하였다.

&nbsp; 따라서, **하위 모듈에 컴파일 시 `-parameters` 옵션만 추가하는 것이 해당 문제의 정확한 해결 방법**이라고 생각하였다.

```groovy
// root의 build.gradle

subprojects {
    // ...

    tasks.withType(JavaCompile).configureEach {
        options.compilerArgs.add('-parameters')
    }
}
```

&nbsp; 따라서, root의 build.gradle에 하위 모듈에서 컴파일 인자(`CompileArgs`)로 `-parameters` 옵션을 추가하였다.

&nbsp; 해당 옵션이 추가된다면 컴파일 시 클래스 파일에도 생성자의 파라미터명이 남아있게 되기 때문에 생성자 바인딩이 정상적으로 성공한다.

### 생성자 바인딩 방식을 포기?

&nbsp; 또한, 해당 문제의 해결 방법으로 생성자 바인딩을 포기하는 방법도 고민하였다.

&nbsp; 굳이 `-parameters` 컴파일 옵션을 하위 모듈에 모두 추가해야하는 이유와 이로 인해 클래스 파일에 파라미터명이 포함되어 크기가 약간이라도 더 커지는 것과 같은 부분도 고민이 되었다.

&nbsp; 그러나, 해당 문제가 왜 발생한지에 대해 되돌아보면 <u>컴파일 후 파라미터명이 사라지게 되어 발생</u>하는 문제이기에 _"파라미터명을 통해 수행되는 기능에 동일한 문제가 발생할 수 있지도 않을까?"_ 라는 의문이 들었다.

&nbsp; 예상처럼 `@RequestParam`, `@PathVariable` 등 파라미터명을 사용하는 다양한 기능들이 이러한 문제를 겪으며, 이에 대한 해결 방법이 `-parameters` 옵션을 추가하는 것이다.

&nbsp; 따라서, 단순히 생성자 바인딩 방식에 의한 문제만이 아니기에 생성자 바인딩 방식을 포기하기 보다는 문제의 근본적인 해결책인 `-parameters` 컴파일 옵션을 하위 모듈 전체에 추가하는 결정을 유지하기로 하였다.

&nbsp; 만약, `-parameters` 컴파일 옵션으로 인하여 클래스 파일의 크기가 커지는 것이 문제 대상이라면 문제가 발생할 수 있는 기능을 사용하는 모듈에만 해당 옵션을 붙여 해결할 수도 있을 것이다.

# \# 결론

&nbsp; 멀티 모듈 프로젝트를 진행하며 Spring Boot 공식 문서를 찾아보는 일이 잦아지게 된 것 같다. 멀티 모듈 프로젝트를 사용하며 특히 프로젝트 구조 및 설정과 같은 문제가 자주 발생하기에 공식 문서를 통한 올바른 해결 방법을 찾는 것이 매우 중요하다고 생각한다.

&nbsp; 이번 문제는 문제 상황을 직접 겪고 SpringBoot 로그에서 제공하는 해결 방법을 따라가며 문제를 이해하고, 추가적인 문제와 의문을 정의하며 해결해나가는 과정이 오래 걸리긴 하였지만 이 포스팅을 작성하는 시점에서는 해당 문제의 발생 원인과 해결 방법 등에 대한 인과관계들이 퍼즐 맞춰지듯이 맞추어져 굉장히 만족스러운 포스팅 중 하나가 된 것 같다.

# \# Reference
- [Spring Boot - Externalized Config](https://docs.spring.io/spring-boot/reference/features/external-config.html)
- [Spring Multi Module - Create the library project](https://spring.io/guides/gs/multi-module#_create_the_library_project)