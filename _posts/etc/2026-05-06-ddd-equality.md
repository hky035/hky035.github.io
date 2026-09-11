---
layout: posts
title: 'DDD를 적용하며 깨달은 객체 동등성의 중요성'
author_profile: true
sidbar:
   nav: 'main'
category: 'etc'
description: '&nbsp; 학부생 때 전공 과목 프로젝트로 진행하였던 카풀 프로젝트를 도메인 주도 설계(DDD)의 헥사고날 아키텍처 기반으로 리팩토링하였다. 리팩토링 과정에서 특정 도메인을 표현하기 위해 도메인 엔티티와 VO(Value Object)를 정의하며 기능을 구현해나갔다. 이후 테스트 코드를 작성하며 스터빙(Stubbing)을 진행하고, 이를 해결하기 위해 <code>any(...)</code> 메서드를 사용하며 부정확한 테스트를 작성하고 있었다는 점을 인지하게 되었다. 이번 포스팅에서는 이러한 경험을 계기로 도메인 주도 설계에서 객체의 동등성 보장이 왜 중요한지에 대해 고민하고, 이를 통해 얻은 인사이트를 공유해보고자 한다.'
published: true
show_date: true
---

# 서론 - 객체 동등성이 보장되지 못하여 테스트가 실패한 경험

&nbsp; 최근 '소프트웨어 설계' 전공 과목에서 진행한 카풀 프로젝트를 리팩토링하며 도메인 주도 설계(DDD, Domain-Driven Design)의 헥사고날 아키텍처를 적용하였다. 따라서, 특정 도메인을 표현하기 위해 도메인 엔티티(Domain Entity)와 VO(Value Object) 객체를 정의하는 것을 중요하게 생각하게 되었다.

&nbsp; 또한, 기능을 하나씩 구현하면서 BDD Mockito를 기반으로 테스트 코드를 작성하며 스터빙(Stubbing)을 진행하였다.

```java
@Test
@DisplayName("사용자 요약 정보 조회 성공")
void success() {
    // given
    User user = UserFixture.create();
    Long userId = user.getId().getValue();
    String nickname = user.getNickname().getValue();
    String email = user.getEmail().getValue();
    String studentNumber = user.getStudentInfo().getStudentNumber().getValue();
    
    GetUserSummaryQuery query = new GetUserSummaryQuery(userId);
    // ⭐️ 새로운 사용자 고유 번호 VO 객체(UserId)로 스터빙
    given(readUserPort.findByUserId(new UserId(userId))).willReturn(Optional.of(user));
    
    // when
    GetUserSummaryResult result = usecase.getUserSummary(query);
    
    // then
    assertEquals(nickname, result.nickname());
    assertEquals(email, result.email());
    assertEquals(studentNumber, result.studentNumber());
}
```

![stubbing-fail](/assets/img/docs/etc/ddd-equality/stubbing-fail.png)

&nbsp; 사용자 고유 번호를 나타내는 `UserId` VO 객체의 생성자를 통해 새로운 객체로 만들어 스터빙한 코드에 적용하였다. 테스트를 실행해보면 아래 사진과 같은 에러가 발생하였다.

&nbsp; 에러 로그에서도 확인할 수 있듯이 스터빙 시 사용한 `UserId` 객체와 실제 테스트 시 메서드 호출에 사용된 `UserId` 객체가 서로 다른 객체이기 때문에 스터빙이 제대로 동작하지 않아 발생한 것이다.

&nbsp; 이러한 실패 상황을 보면서 "기존 테스트 코드에서 스터빙은 어떤 식으로 작성하였지?"라는 의문이 들어, 이전의 테스트 코드들을 확인해보았다.

```java
@Test
@DisplayName("로그인 성공 시 AuthToken을 반환한다")
void success() {
    // given
    // ⭐️ any(...) 메서드를 사용한 스터빙
    given(readUserPort.findByUsername(any(Username.class))).willReturn(Optional.of(user));
    given(passwordPort.matches(any(RawPassword.class), any(EncodedPassword.class))).willReturn(true);
    given(authTokenIssuer.generateAuthToken(any(UserId.class))).willReturn(new AuthToken(accessToken, refreshToken));
    
    // when
    AuthToken authToken = usecase.signin(command);
    
    // then
    assertEquals(accessToken.getValue(), authToken.getAccessToken().getValue());
    assertEquals(refreshToken.getValue(), authToken.getRefreshToken().getValue());
    verify(refreshTokenStore, times(1)).save(any(UserId.class), any(RefreshToken.class));
}
```

&nbsp; 기존 테스트 코드들에서는 `any(...)` 메서드를 사용하여서 인자로 전달되는 값의 타입만 일치하면 스터빙이 진행되도록 설정하였었다.

&nbsp; 이전에도 "`any(...)`를 사용한 스터빙 시 주요 로직에 대한 검증이 확실한가?"는 의문이 든 적이 있다.

&nbsp; 당시에는 단위 테스트의 관심사는 테스트를 진행하는 메서드의 로직 검증이며, 메서드 호출 시 전달된 값이 별도의 변환 과정 없이 그대로 다음 로직으로 전달되는 경우가 많았기 때문에 `any(...)` 메서드를 사용한 스터빙에도 큰 문제를 느끼지 못하였다.

&nbsp; 그러나 도메인 엔티티와 VO를 중심으로 코드를 작성하고, 각 계층(모듈) 간 역할을 명확하게 분리하면서 상황은 달라졌다. 외부에서 내부로 전달된 DTO는 application 계층 내부에서 도메인 엔티티 혹은 VO로 변환되어 사용되었고, 반대로 외부 계층으로 데이터를 변환할 때 역시 DTO 변환 과정이 수행되었다.

&nbsp; 즉, <u>유즈케이스 내부에서는 단순히 전달받은 값을 그대로 사용하는 것이 아니라, 도메인으로써의 의미를 가지는 객체를 생성하게 되는 것도 핵심 비즈니스 로직에 포함</u>하게 된 것이다.

&nbsp; '타입'만 중요한 것이 아니라, 의도한 값 자체의 '의미'도 중요해졌다. 따라서 테스트 코드에서 `any(...)` 메서드를 사용하여 타입만 일치하면 스터빙이 동작하도록 하는 방식이 충분히 올바른 검증인가에 대한 의문을 가지게 되었다.

&nbsp; 특히, VO처럼 값 자체가 의미를 가지는 객체인 경우에는 잘못된 값으로 객체가 생성되거나 예상치 못한 DTO - VO 간 변환이 발생하더라도 `any(...)` 기반 스터빙은 이를 검증하지 못한다.

&nbsp; 이러한 과정을 거치며 다음과 같은 점들을 깨닫게 되었다.

- VO(Value Object)는 값 자체가 의미를 가지는 객체이므로, 올바른 비즈니스 동작과 정확한 테스트 검증을 위한 동등성 보장이 필요하다.
- `any(...)` 기반 스터빙은 객체 타입만을 기준으로 동작하기 때문에, DTO ↔ VO 변환 과정에서 발생할 수 있는 오류를 검증하지 못하는 한계가 존재한다.

&nbsp; 이러한 2가지 관점을 기반으로 **"도메인 주도 설계에서 동등성 보장이 왜 중요한가?"**는 질문의 답을 찾아나갈 수 있었다.

# 도메인 엔티티와 VO의 비교

## 도메인 엔티티(Entity)

&nbsp; 도메인 엔티티는 고유한 식별자(id, identifier)를 가지며, 특정 도메인에서 해결해야하는 대상을 표현한 객체이다.

&nbsp; 예를 들어 사용자, 주문, 게시글과 같은 객체들은 단순한 데이터의 묶음이 아니라 객체 자체가 특정 도메인을 표현한다.

```
User(id = 1, nickname = "test01")

User(id = 1, nickname = "test02")
```

&nbsp; 위 두 객체는 객체의 닉네임이 다르지만, 식별자(id)가 동일하기 때문에 같은 사용자를 의미한다.

&nbsp; 즉, <u>엔티티는 식별자(id)를 통해서 객체를 식별</u>한다. 

## VO(Value Object)

&nbsp; VO(Value Object)는 도메인 엔티티에서 사용되는 개별 요소의 의미를 감싸는 객체를 의미한다.

&nbsp; 예를 들어 이메일, 주소, 금액, 학번과 같은 객체들은 별도의 식별자를 가지는 것이 아니라 객체 자체의 값이 식별에 사용된다.

```
new Email("kim@gmail.com");

new Email("kim@gmail.com");
```

&nbsp; 위 두 객체는 서로 다른 인스턴스이지만, 이메일 값을 표현하는 VO이므로 내용(이메일 주소)이 같으므로 같은 객체로 취급되어야 한다.

&nbsp; 즉, <u>VO는 객체의 주소(고유식별자, identity)가 아니라 내부 값(value)을 기준으로 비교</u>되어야 한다.

# 동일성(identity)과 동등성(equality)

&nbsp; 객체를 비교할 때 **동일성(identity)**와 **동등성(equality)**이란 개념이 사용된다.

&nbsp; **동일성(identity)**이란 두 객체가 완전히 같은 지를 의미하며, Java에서는 참조 타입인 두 객체의 주소가 같은 경우를 의미한다.

&nbsp; **동등성(equality)**이란 두 객체가 동일한 정보를 가지고 있다는 것을 의미하며, 두 변수가 저장된 주소가 다르더라도 가지는 값이 같으면 같은 객체를 의미하는 경우를 일컫는다. 

# VO에서 동등성이 보장되어야 하는 이유

&nbsp; 동등성의 의미에서 VO에서 동등성이 보장되어야하는 이유를 알 수 있다.

&nbsp; VO는 내부 값을 특정한 의미를 담아 감싸는 래핑된 객체를 의미하며, 가지는 값 자체가 해당 객체의 정체성이라 할 수 있다. 즉, <u>해당 객체가 실질적으로 의미하는 값이 같으면 같은 객체로 취급</u>해야한다.

&nbsp; 해당 개념은 **동등성**을 의미하며, VO에서 동등성이 보장되어야 하는 이유이다.

# 동등성이 필요한 곳

&nbsp; 객체의 동등성이 보장되어야지만 동작에 이상이 없는 것들은 다음과 같다.

- VO의 개념
- Mockito Stubbing
- Collection - HashSet

&nbsp; 위 개념들에서 동등성(equality)이 보장되어야하는 이유를 찾을 수 있다. VO의 개념에서는 앞서 설명한 것과 같은 내용이다.

&nbsp; Mockito Stubbing은 해당 포스팅의 서론 부분에서 언급한 부분과 같이, 스터빙된 메서드의 인자가 동등한 경우에만 스터빙에서 설정한 동작대로 테스트를 진행할 수 있다.

&nbsp; 물론 동등성을 통한 비교외에도 `argThat(...)` 메서드를 통해서 스터빙을 진행할 수도 있다.

```java
@Test
@DisplayName("사용자 요약 정보 조회 성공")
void success() throws Exception {
    // given
    String nickname = UserFixture.nickname();
    String email = UserFixture.email();
    String studentNumber = UserFixture.studentNumber();
    
    GetUserSummaryResult result = new GetUserSummaryResult(nickname, email, studentNumber);
    // ⭐️ argThat(...) 메서드를 통한 스터빙
    given(getUserSummaryUsecase.getUserSummary(argThat(arg -> arg.userId() == 1L))).willReturn(result);
    
    // when
    ResultActions resultActions = mockMvc.perform(
            get("/api/v1/users/summary")
                    .with(user(userDetails))
    ).andDo(print());
    
    // then
    resultActions
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.nickname").value(nickname))
            .andExpect(jsonPath("$.data.email").value(email))
            .andExpect(jsonPath("$.data.studentNumber").value(studentNumber));
}
```

&nbsp; 이 외에도 `HashSet`과 같은 Collection 사용 시에도 동등성이 보장되어야 한다. 정확하게는 클래스에 `hashCode()`와 `equals()` 메서드를 구현해야한다.

# equals()와 hashCode()

## equals()

&nbsp; Java에서는 객체의 동등성(equality)를 비교하기 위해서는 `Object` 클래스에서 제공하는 `equals(Object o)` 메서드를 오버라이딩 해야한다.

&nbsp; `equals()` 메서드는 기본적으로 객체의 주소를 기반으로 비교를 수행하기 때문에 내부 값이 동일한 객체더라도 서로 다른 인스턴스로 생성된 경우에는 다른 객체로 판별한다.

&nbsp; 그러나 VO는 객체 내부 값 자체가 객체의 의미를 결정한다. 따라서, 서로 다른 인스턴스라 하더라도 객체가 가지는 값이 같다면 같은 객체로 판별하여야 한다.

&nbsp; 따라서, VO에서는 값 기반 비교가 가능하도록 `equals()` 메서드를 오버라이딩하여 값을 비교하도록 구현해야한다.

## hashCode()

&nbsp; `hashCode`는 `equals()`와 동시에 자주 언급되는 메서드이다. 또한, `equals()`를 구현할 경우 무조건 `hashCode()`도 구현해야한다고 언급된다.

&nbsp; `equals()`가 객체의 동등성을 보장하는데 굳이 `hashCode()`도 구현해야하는 이유가 뭘까?

&nbsp; 그 이유는 Java에서는 Hash 기반 Collection(`HashSet`, `HashMap`, `HashTable`)이 존재하기 때문이다. 해당 컬렉션들이 객체를 저장하고 조회할 때 `hashCode()`와 `equals()`를 같이 사용한다.

&nbsp; `HashSet`과 같은 컬렉션은 객체를 저장할 때, 우선 `hashCode()`를 기반으로 버켓(Hash Bucket)의 위치를 찾는다. 이후 같은 해시 값을 가지는 객체들에 대해서는 `equals()` 메서드를 통해 동일한 객체인지 판별한다. `HashSet`의 경우에는 Set(집합)이기 때문에 동일한 객체가 중복으로 저장되더라도 하나의 객체만 저장된다.

&nbsp; 따라서, `equals()`를 구현하여 두 객체의 동등성을 보장하였더라도 `hashCode()`를 구현하지 않는다면 해당 객체를 Hash Collection에 저장할 때 중복 저장되는 등 예기치 못한 동작으로 이어질 위험성이 존재하기 때문에 `equals()`와 `hashCode()`를 동시에 구현하여야 한다.

# 마무리

&nbsp; 헥사고날 아키텍처를 기반으로 도메인 주도 설계를 심도있게 공부하고 있다. 애그리거트, 바운디드 컨텍스트와 같이 실제 비즈니스 규모에서 사용되는 거시적인 개념들을 이해하고 사용하는 것에는 한계가 있어 우선은 도메인의 개념과 의미를 중점으로 구조를 고민하고 있다.

&nbsp; 사실 기존에는 `equals()`와 `hashCode()`를 단순히 "같은 객체인지를 판별하기 위한 메서드" 정도로만 이해하고 있었다. 또한 VO(Value Object)를 적극적으로 사용하지 않았기 때문에, 객체 비교 역시 대부분 엔티티의 식별자(id)를 기준으로 수행하였고 실질적으로 객체의 동등성을 깊게 고민해본 경험이 많지 않은 것 같다.

&nbsp; 그러나 카풀 프로젝트를 리팩토링하며 계층(모듈) 간 경계를 명확히 분리하고, DTO ↔ Entity, VO 변환 규칙을 엄격하게 적용하는 구조로 설계를 변경하면서 객체 동등성의 중요성을 체감할 수 있었다.

&nbsp; 이전에는 단순히 "객체 비교에는 `equals()`를 사용한다" 정도로만 이해하고 있었다면, 이번 경험을 통해 VO는 값 자체가 의미를 가지는 객체이기 때문에 객체의 주소가 아니라 값 기반으로 같음을 판별할 수 있어야 하며, 이를 위해 Java에서는 `Object.equals()`와 `hashCode()`를 오버라이딩하여 동등성을 보장해야한다는 점을 실제적인 경험을 통해 이해할 수 있었다.