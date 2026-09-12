---
layout: posts
title: 'QueryDSL Q클래스 생성 방식과 QueryDSL-Sentry plugin 충돌 해결'
author_profile: true
sidbar:
   nav: 'main'
category: 'etc'
description: '&nbsp; 모의 주식 투자 웹 서비스 &apos;무주시&apos; 운영 환경의 에러 모니터링과 장애 대응 속도·경험 개선을 위해 Sentry를 도입하였다. Sentry 도입 후 빌드 과정에서 QueryDSL의 Q 클래스와 충돌이 일어나며 빌드가 실패하였다. 해당 문제를 해내가며 QueryDSL 생성 방식과 충돌 원인 등을 알아보았다.'
published: true
show_date: true
---

# \# 서론

&nbsp; 모의 주식 투자 웹 서비스 '무주시' 운영 환경에서 장애가 발생한 경우 예외 원인을 파악하는데 어려움이 존재하였다.

&nbsp; 프론트엔드 파트 팀원이 에러 확인 요청 후 특정 기능에 장애가 일어났다는 것을 인식하였고, 이를 확인하는 과정도 서버에 SSH 연결 후 직접 로그를 확인하는 수 밖에 없었다. 또한, 일관적인지 않은 예외 로그와 클라이언트의 비즈니스 규칙 위배 오류와 외부 인프라 호출 시 발생한 예외같이 서버 상의 치명적인 예외에 대한 로그가 같은 `error` 레벨로 출력되어 확인의 어려움도 존재하였다.

&nbsp; 이를 해결하기 위해 로깅 규칙을 정의하고, 서버에 [Sentry](https://sentry.io/)를 도입하여 운영 환경의 예외를 모니터링하기로 결정하였다.

&nbsp; 그러나, Sentry 적용 후 애플리케이션 빌드 과정에서 실패를 마주하였고, 이를 QueryDSL의 Q클래스 생성 디렉토리 설정으로 인한 Task간 의존성 문제로 인한 에러였다. 또한, 해당 에러의 원인을 알아보며 현재 build.gradle에 적용된 QueryDSL 설정 스크립트는 컴파일 시점의 Q클래스를 생성하던 예전 방식의 잔재와 혼용되었다는 문제를 인식하였다.

&nbsp; 이번 포스팅에서는 해당 에러를 마주하게 된 과정과 원인을 , QueryDSL의 기존 설정 방식과 현재 사용 방식 등을 알아본 경험을 정리하고자 한다.

# \# 본론

## 문제 상황

&nbsp; Sentry는 [Gradle Plugin](https://docs.sentry.io/platforms/java/guides/spring-boot/gradle/)으로 설치하였다. 이후 스택 트레이스 상의 예외가 발생한 소스 코드를 확인하기 위해 `includeSourceContext` 설정을 `true`로 설정하였다.

```gradle
// build.gradle
plugins {
    // ...
    id "io.sentry.jvm.gradle" version "6.21.0"
}

sentry {
  includeSourceContext = System.getenv("SENTRY_AUTH_TOKEN") != null; // true

  org = "team-digimon"
  projectName = "muzusi"
  authToken = System.getenv("SENTRY_AUTH_TOKEN")
}
```

&nbsp; 위 설정 후 빌드를 진행하니 아래와 같은 에러를 마주하였다.

![build-error](/assets/img/docs/etc/query-dsl-apt/build-error.png)

```sh
* What went wrong:
A problem was found with the configuration of task ':generateSentryBundleIdJava' (type 'GenerateBundleIdTask').
  - Gradle detected a problem with the following location: '/Users/hky035/Desktop/project/muzusi-project/muzusi-was/src/main/generated'.
    
Reason: 
Task ':generateSentryBundleIdJava' uses this output of task ':compileJava' without declaring an explicit or implicit dependency. 
This can lead to incorrect results being produced, depending on what order the tasks are executed.

Possible solutions:
    1. Declare task ':compileJava' as an input of ':generateSentryBundleIdJava'.
    2. Declare an explicit dependency on ':compileJava' from ':generateSentryBundleIdJava' using Task#dependsOn.
    3. Declare an explicit dependency on ':compileJava' from ':generateSentryBundleIdJava' using Task#mustRunAfter.
```

&nbsp; 문제 로그를 살펴보면 핵심 부분은 아래와 같다.

- generateSentryBundleIdJava 태스크의 설정 문제를 발견하였다.
- src/main/generated 경로에서 문제를 발견하였다.
- generateSentryBunldeIdJava는 compileJava 태스크의 출력을 사용하나, 명시적·암시적 의존성 선언이 없다.
- 이를 고치기 위해선 다음 해결책 적용이 가능하다.
    1. compileJava를 generateSentryBundleIdJava의 입력(input)으로 선언
    2. `Task#dependesOn`을 사용하여 generateSentryBundleIdJava로부터 compileJava 의존성을 명확히 선언
    3. `Task#mustRunAfter`을 사용하여 generateSentryBundleIdJava로부터 compileJava 의존성을 명확히 선언

&nbsp; 문제 상황은 **generateSentryBundleIdJava** 태스크 수행 중 `/src/main/generated` 경로 상의 문제가 존재하고, 이는 **compileJava** - **generateSentryBundleIdJava** 태스크 간 의존성 문제로 인해 발생한 것이다.

&nbsp; `/src/main/generated` 경로는 기본 SpringBoot에는 생성되지 않는 경로이다. 이 경로는 QueryDSL 도입 시 build.gradle에 정의한 경로이다.

## 기존 QueryDSL 설정 스크립트

```gradle
dependencies {
    implementation 'com.querydsl:querydsl-jpa:5.0.0:jakarta'
    annotationProcessor "com.querydsl:querydsl-apt:${dependencyManagement.importedProperties['querydsl.version']}:jakarta"
}

def querydslDir = 'src/main/generated'

sourceSets {
    main.java.srcDirs += [querydslDir]
}

configurations {
    querydsl.extendsFrom compileClasspath
}

tasks.withType(JavaCompile).configureEach {
    options.getGeneratedSourceOutputDirectory().set(file(querydslDir))
}

clean.doLast {
    file(querydslDir).deleteDir()
}
```

&nbsp; '무주시'에 QueryDSL 도입할 당시, build.gradle 설정은 이전 프로젝트에서 쓰던 스크립트를 관습적으로 그대로 가져와 적용했다.

&nbsp; 여기서 `/src/main/generated` 경로가 등장한다. 

## 문제 원인 파악 

&nbsp; 앞서 해당 문제는 **compileJava** - **generateSentryBundleIdJava** 태스크 간 의존성 문제로 인하여 발생한 것이라는 것을 알게 되었다.

&nbsp; 즉, 해당 설정에서 컴파일 과정에 관여하는 스크립트는 **'생성된 Source Output 결과물 저장 경로'**를 설정하는 부분이다.

```gradle
tasks.withType(JavaCompile).configureEach {
    options.getGeneratedSourceOutputDirectory().set(file(querydslDir))
}
```

&nbsp; 위 설정은 `JavaCompile` 타입의 모든 태스크들의 결과로 생성되는 Source Output의 디렉토리(경로)를 `querydslDir = /src/main/generated`로 설정하는 스크립트이다. 이는 QueryDSL로 인해 생성되는 Q클래스들을 `/src/main/generated` 경로에 생성되도록 한다.

&nbsp; 따라서, QueryDSL의 결과로 생성되는 Q클래스들은 `/src/main/generated` 경로에 위치하며 해당 경로는 `sourceSets.main.java.srcDirs`에 포함되어 있다.

&nbsp; Sentry의 includeSourceContext 기능은 소스 컨텍스트 매칭을 위해 sourceSets에 속한 파일들을 읽어야 하는데, <u><code>/src/main/generated</code>가 SourceSets에 포함돼있어 generatedSentryBundleIdJava 태스크의 입력 대상</u>이 된 것이다.

&nbsp; Q클래스도 Sentry의 includeSourceContext 기능의 추적 대상이며, 컴파일 과정(compileJava 태스크)의 결과물이 generateSentyBundleIdJava의 입력으로 사용되어야 하는 것이다.

&nbsp; 그러나, **Gradle의 Task 실행은 순서를 보장하지 않는다.**

&nbsp; Gradle은 태스크 사이의 `dependsOn`, `mustRunAfter`, `shouldRunAfter` 혹은 input/output이 자동으로 연결되는 경우만 두 태스크 간 의존성이 있다고 판단하여 순차적으로 실행한다. 두 태스크 간 이러한 관계가 없다면 실행 순서가 보장되지 않는다.

&nbsp; 따라서, 컴파일 과정에서 Q클래스의 결과물(output)을 생성 → Sentry의 includeSourceContext 기능을 수행하기 위해 `/src/...` 경로를 참조하는 것의 순서가 보장되지 않아 해당 문제가 발생한 것이다.

### 해결 방법

&nbsp; 해당 문제의 해결 방법의 에러 로그에 명시되어있는 것처럼 **두 태스크간 의존성을 정확히 명시**해주기만 하면 된다.

&nbsp; 그러나, _"QueryDSL + Sentry를 적용하면 Task간 의존성 설정을 진행해주는 것이 근본적인 해결책인가?"_ 라는 의문이 들었다. 

&nbsp; 그리고, `JavaCompile` 타입의 컴파일 태스크 결과물을 `/build/`가 아닌 `/src` 경로에 출력하는 것에 대한 근본적인 의문도 들었다. 

## QueryDSL 설정 스크립트 다시 보기

```gradle
dependencies {
    // QueryDSL 의존성 추가
    implementation 'com.querydsl:querydsl-jpa:5.0.0:jakarta'
    // QueryDSL 어노테이션 프로세서 추가
    annotationProcessor "com.querydsl:querydsl-apt:${dependencyManagement.importedProperties['querydsl.version']}:jakarta"
}

// QueryDSL 결과물(Q클래스) 저장 경로 정의
def querydslDir = 'src/main/generated'

// SourceSets에 경로 추가
sourceSets {
    main.java.srcDirs += [querydslDir]
}

// 컴파일 시점의 Q클래스 생성 시 기존 compileClasspath를 사용
configurations {
    querydsl.extendsFrom compileClasspath
}

// JavaCompile 타입으로 인해 생성되는 결과물을 출력 경로를 지정
tasks.withType(JavaCompile).configureEach {
    options.getGeneratedSourceOutputDirectory().set(file(querydslDir))
}

// /src 경로는 graldew clean 시 자동 삭제되지 않으므로 수동 삭제
clean.doLast {
    file(querydslDir).deleteDir()
}
```

&nbsp; QueryDSL 설정 스크립트를 다시 살펴보면 다음과 같다.

&nbsp; 핵심적인 부분은 **QueryDSL 어노테이션 프로세서**를 적용한 것이다.

&nbsp; 필자는 지금까지 _"컴파일 과정에서 어노테이션 프로세싱이 일어나므로 위와 같은 설정 스크립트들이 필요하구나"_ 라고 생각하였다. 그러나, 해당 스크립트는 이전 별도의 태스크를 통해 Q클래스를 생성하던 방식의 잔재라는 것을 깨달았다. 

&nbsp; 스크립트를 보며 필자가 든 생각과 이에 대해 찾아본 답은 아래와 같다.

### 1. 왜 SourceOutput의 경로는 /src/main/generated로 지정하였는가?

&nbsp; 이전 IDE에서는 SourceOutput의 기본 경로인 `/build/src/main/generated`에 생성되는 결과물들을 잘 인식하지 못하였다. 따라서, 의도적으로 `/build` 대신 `/src/main/generated` 경로에 Q클래스를 생성하여 IDE에서 인식이 가능하도록 만든 것이다.

&nbsp; 그러나, 최근에는 IDE에서 `/build/` 경로 내 생성되는 Q클래스도 문제없이 인식이 된다.

### 2. querydsl은 왜 compileClasspath를 구성하는가?

&nbsp; 이전 Q클래스 생성 방식은 어노테이션 프로세싱이 아닌 **별도의 태스크를 만들어 Q클래스를 생성**하고, 생성 후 만들어지는 Q클래스를 포함하여 전체 클래스를 함꼐 컴파일(compileJava)하였다.

&nbsp; 따라서, Q클래스를 생성하는 태스크는 compileJava와 독립된 태스크이므로 Q클래스 생성에 사용되는 다른 클래스들을 사용하기 위해 직접 compileClasspath를 확장하여 사용한다.

### 3. 어노테이션 프로세싱 방식은 기존 방식과 다른가?

&nbsp; 다르다.

&nbsp; 위 설명처럼 기존의 Q클래스 생성 방식은 <u>compileJava와 별개의 태스크를 통한 Q클래스를 생성</u>하는 방식이었다.

&nbsp; 그러나, 어노테이션 프로세싱 방식은 [JSR 269: Pluggable Annotation Processing API](https://jcp.org/en/jsr/detail?id=269)에 정의된 방법으로, <u>별도의 태스크없이 compileJava 중 javac가 어노테이션 프로세싱을 수행하면서 Q클래스를 생성</u>하는 방식이다. 즉, 원본 클래스 컴파일 + Q클래스 생성을 동시에 처리하는 것이다.

<br/>

&nbsp; 즉, 위 방식들은 QueryDSL이 이전의 IDE의 호환성 문제, 별도의 Gradle Task를 활용한 Q클래스 생성 방식을 사용할 때 설정하던 잔재인 것이다.

```sh
./gradlew clean
```

&nbsp; 따라서, 수동 clean 명령어를 통해 기존에 생성했던 Q클래스 + build/ 디렉토리를 정리하였다. 또한, 이전 잔재로 남아있던 설정 스크립트는 모두 삭제하였다.

## build.gradle 내 QueryDSL 설정 코드 개선

```gradle
dependencies {
    implementation 'com.querydsl:querydsl-jpa:5.0.0:jakarta'
    annotationProcessor "com.querydsl:querydsl-apt:${dependencyManagement.importedProperties['querydsl.version']}:jakarta"
}
```

&nbsp; 어노테이션 프로세싱 방식을 사용하는 최신 QueryDSL에서는 이전에 사용하던 코드들이 모두 필요없다. 

&nbsp; 따라서, 해당 설정 코드들을 모두 제거하고 QueryDSL 디펜던시와 어노테이션 프로세서만 명시하였다. 위와 같이 설정 변경 후 빌드 또는 컴파일을 통해 Q클래스를 생성할 수 있게 되었다.

> Gradle에서 build는 compileJava, processResources, classes, bootJar 등 여러 Task들의 묶음 실행 과정이기에 빌드 시 컴파일도 진행이 된다.

```gradle
./gradlew compileJava
```

&nbsp; 따라서, 새로운 엔티티 관련 클래스 생성 후 컴파일을 통해 Q클래스를 생성할 수 있다. 그 결과 Gradle 어노테이션 프로세싱 기본 경로 `build/generated/sources/annotationProcessor/` 에 Q클래스들이 생성되게 된다. 인텔리제이로 빌드할 경우 설정에서 어노테이션 프로세서 기능을 활성화해야한다.

&nbsp; 위와 같이 변경 후, Q클래스 생성은 compileJava 태스트의 일부인 어노테이션 프로세싱 과정에서 수행이 되므로 Sentry 플러그인의 generateBundleIdJava 태스크와 의존성 충돌이 일어나지 않게 되었다. 

# \# 결론

&nbsp; 이 경험은 Sentry를 도입하기로 한 결정을 통해 기존 QueryDSL 설정 코드의 문제점을 찾아낸 소중한 경험이라고 생각한다.

&nbsp; 만약, Sentry를 Gradle Plugin으로 설치하지 않았거나 Sentry 자체를 도입하지 않았다면 모르고 넘어갔을 부분이라고 생각한다.

&nbsp; 이전 프로젝트에서도 QueryDSL은 코드 작성 방법 등을 많이 찾아보았지만, 생성되는 방식에 대한 의문에 대해서는 제대로 찾아보지 못하였던 것 같다. "이 설정 스크립트가 `/src/main/generated` 경로에 Q클래스를 생성하는구나" 정도로만 이해를 하고, 이에 대한 불편함을 느꼈었지만 실제로 해당 코드의 동작을 제대로 찾아보게 된 것은 이번이 처음인 것 같다.

&nbsp; QueryDSL을 사용하며 가장 궁금증을 가지고 있던 부분들을 이번 기회를 통해 해결할 수 있었다. 단순히 Java 코드를 넘어 Gradle 빌드툴의 동작 원리와 Task, 컴파일과 어노테이션 프로세싱 등에 대한 이해가 필요한 이유도 다시 한 번 깨닫게 된 경험이기도 하다. 

