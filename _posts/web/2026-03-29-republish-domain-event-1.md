---
layout: posts
title: "도메인 이벤트 재발행 구조 도입기 1 - Event Outbox의 저장"
author_profile: true
sidbar:
  nav: "main"
category: "web"
description: "&nbsp; 여행 기록 관리 플랫폼 '여기가' 프로젝트를 진행하며 이메일 인증·비밀번호 초기화 이메일 전송 기능 개발을 담당하게 되었다. 이메일 전송은 외부 메일 서버를 거쳐 실행되는 작업으로 Network I/O 등 시간이 오래 걸리는 작업이다. 따라서, 핵심 비즈니스 로직과 이메일 발송 로직을 분리하여 결합도를 낮추고, 향후 메일 서버 분리의 확장성을 염두에 두고 이메일 발송 로직을 이벤트 기반 아키텍처(EDA)로 분리하였다. EDA 도입 후 메시지 브로커로 이벤트가 발행되지 않아 이벤트가 유실되는 문제를 겪고 이에 대한 해결 방법을 모색하던 중 'Transactional Outbox Pattern'을 알게 되었다. 이번 포스팅에서는 각 도메인 이벤트를 일관된 EventOutbox로 변환하여 저장하는 과정을 구현한 경험을 공유하고자 한다."
published: true
show_date: true
---

# \# Related Post

- <i class="fas fa-link" style="font-size: 13.5px; font-weight: bold;"></i> [Event Driven Architecture와 Transactional Outbox Pattern의 연관성](/web/eda-and-tx-outbox-pattern/)
- <i class="fas fa-link" style="font-size: 13.5px; font-weight: bold;"></i> **도메인 이벤트 재발행 구조 도입기 1 - EventOutbox의 저장**
- <i class="fas fa-link" style="font-size: 13.5px; font-weight: bold;"></i> [도메인 이벤트 재발행 구조 도입기 2 - 커직 직후 발행과 RabbitMQ Publish Confirm](/web/republish-domain-event-2/)   
- <i class="fas fa-link" style="font-size: 13.5px; font-weight: bold;"></i> [도메인 이벤트 재발행 구조 도입기 3 - 이벤트 아웃박스 폴링을 통한 이벤트 발행](/web/republish-domain-event-3/)   

# \# 서론

&nbsp; 여행 기록 관리 플랫폼 '여기가' 프로젝트를 진행하며 이메일 인증·비밀번호 초기화 이메일 발송 기능을 구현하였다. 이메일 발송은 외부 메일 서버와 통신하는 Network I/O 작업이므로, 핵심 비즈니스 로직과 결합도를 낮추고 향후 메일 발송 기능을 별도 서비스로 분리할 수 있도록 이벤트 기반 구조를 도입하였다.

&nbsp; 그러나 이벤트를 메시지 브로커로 전달하는 과정에서 발행에 실패하면 해당 이벤트를 다시 처리하기 어렵다는 문제가 있었다. 이를 해결할 방법을 찾던 중 Transactional Outbox Pattern(트랜잭션 아웃박스 패턴)을 알게되었고, 이 패턴의 이벤트 영속화 아이디어를 참고하여 도메인 이벤트 재발행 구조를 도입하였다.

&nbsp; 이번 글에서는 서로 다른 도메인 이벤트를 공통된 EventOutbox로 변환하고 저장하는 구조를 구현한 과정을 다룬다.

# \# 본론

## 문제 정의

&nbsp; 도메인 이벤트에 대한 아웃박스 저장·이벤트 발행 구조를 구현하는데 있어 처음에는 "도메인 이벤트 별 아웃박스 저장·발행 로직을 구현하면 되지 않을까?"는 생각을 하였다. 실제로도 이러한 생각을 기반으로 구현을 시작하였다. 

&nbsp; 그러나, 이메일 인증 이벤트에 대한 아웃박스 저장 로직을 구현한 뒤 비밀번호 초기화 이벤트에도 같은 구조를 적용하는 과정에서, <u>도메인 이벤트의 종류만 다를 뿐 거의 동일한 로직을 반복해서 구현하고 있다는 점이 비효율적</u>으로 느껴졌다. 

## 해결 방안

&nbsp; 위 문제를 해결하기 위해 도메인 이벤트 타입과 관계없이 공통으로 적용할 수 있는 아웃박스 변환·저장 흐름이 필요하다고 판단하였다.

&nbsp; 따라서, 이에 모든 도메인 이벤트가 공통 상위 타입 `DomainEvent`를 상속하고, 하나의 리스너가 이벤트를 `EvnetOutbox` 엔티티로 변환해 저장하는 구조로 재설계하였다. 이에 대한 구현 과정을 이번 포스팅에서 서술할 것이다.

## EventOutbox 구조

```java
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Entity(name = "event_outbox")
public class EventOutbox {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "event_id", nullable = false, length = 26)
    private String eventId;
    
    @Column(name = "event_type", nullable = false)
    private String eventType;
    
    @Column(nullable = false)
    private String payload;
    
    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private EventOutboxStatus status;
    
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
    
    @Column(name = "last_retried_at")
    private LocalDateTime lastRetriedAt;
    
    @Column(name = "fail_count")
    private int failCount;
    
    @Builder
    public EventOutbox(String eventId, String eventType, String payload, LocalDateTime createdAt) {
        this.eventId = eventId;
        this.eventType = eventType;
        this.payload = payload;
        this.createdAt = createdAt;
        this.status = EventOutboxStatus.WAITING;
    }
    
    public static EventOutbox fromEvent(DomainEvent event, String payload) {
        return EventOutbox.builder()
                .eventId(event.getEventId())
                .eventType(event.getClass().getName())
                .payload(payload)
                .createdAt(event.getCreatedAt().toLocalDateTime())
                .build();
    }
}
```

&nbsp; 아웃박스 테이블의 PK는 IDENTITY 전략으로 생성되는 Long 값을 사용하였다. 순차 증가하는 값을 클러스터드 인덱스 키로 사용하면 새로운 레코드가 주로 인덱스의 마지막 영역에 삽입되므로, 무작위 키를 사용할 때보다 페이지 분할과 단편화 가능성을 줄일 수 있기 때문이다.

&nbsp; 애플리케이션과 메시지 브로커에서는 데이터베이스가 생성한 PK를 이벤트 발행 전에 알기 어렵기 때문에, 이벤트 자체를 식별하기 위한 `eventId`를 별도로 두었다. `eventId`에는 생성 시각을 포함해 대체로 시간순 정렬이 가능한 ULID를 사용하였다. 이를 보조 인덱스로 지정하며 이벤트 조회 시 속도를 높이고자 하였다. 이는 [UUID vs ULID, 인덱스로 사용하는 값에 따른 성능 비교
](/etc/uuid-vs-ulid/) 포스팅에서 검증을 기반으로 선택한 결정이다.

&nbsp; 현재는 도메인 이벤트의 클래스 이름을 `eventType`으로 저장하였다. 구현은 단순하지만 클래스명이나 패키지가 변경되면 기존 이벤트를 역직렬화하기 어려워질 수 있기 때문이다.

&nbsp; 각 도메인 이벤트는 JSON 문자열 형태로 직렬화되어 `payload` 컬럼에 저장된다.

&nbsp; 도메인 이벤트의 재발행을 위해서는 각 이벤트의 발행 상태를 알아야한다. 따라서, `EventOutboxStatus`를 통해 이벤트의 발행 여부를 파악한다. 

```java
public enum EventOutboxStatus {
    WAITING,    // 메시지 브로커로 발행 전(초기 생성 후 기본값)
    PUBLISHED,  // 메시지 브로커로 발행 성공
    FAILED      // 메시지 브로커로 발행 실패
}
```

&nbsp; `createdAt`을 통해 도메인 이벤트의 생성 시각을 저장한다.

&nbsp; 현재 다루는 이벤트에는 인증 번호의 유효 시간이 존재한다. 이벤트가 뒤늦게 발행되면 이미 만료된 인증 코드를 사용자에게 전달할 수 있으므로, 일정 시간이 지난 이벤트는 재발행 대상에서 제외해야 한다. 또한 지속적으로 발행에 실패하는 이벤트를 무제한으로 재시도하면 시스템 자원을 낭비할 수 있다. 이를 반영한 재시도 정책을 적용하기 위해 실패 횟수인 `failCount`와 마지막 재시도 시각인 `lastRetriedAt`을 저장하였다.

## DomainEventListener

&nbsp; 앞서 모든 도메인 이벤트의 일괄적인 처리를 위해 저장·발행 구조를 통일시켜야한다는 해결 방안을 찾았다.

&nbsp; 따라서, 도메인 이벤트를 저장·발행하는 구조는 도메인 이벤트가 더 추가되더라도 큰 변화없이 기존 흐름 안에 포함될 수 있도록 만들어야한다.

&nbsp; 이것은 **"모든 도메인 이벤트는 공통 추상 클래스인 `DomainEvent` 상속한다"**는 규칙을 통해 해결할 수 있다.

```java
@Getter
public abstract class DomainEvent {
    private final ZonedDateTime createdAt;
    private final String eventId;
    
    public DomainEvent() {
        this.createdAt = ZonedDateTime.now(ZoneId.of("Asia/Seoul"));
        this.eventId = UlidCreator.getUlid().toString();
    }
}
```

&nbsp; 이메일 인증 이벤트 `EmailVerificationEvent`와 비밀번호 초기화 이벤트 `PasswordResetEvent`가 모두 `DomainEvent`를 상속하고 있다.

```java
@Getter
public class EmailVerificationEvent extends DomainEvent {
    private final String email;
    private final String code;
    private final ZonedDateTime expiredAt;
    
    public EmailVerificationEvent(String email, String code, int expiration) {
        super();
        this.email = email;
        this.code = code;
        this.expiredAt = getCreatedAt().plusSeconds(expiration);
    }
}
```

```java
@Getter
public class PasswordResetEvent extends DomainEvent {
    private final String email;
    private final String code;
    private final ZonedDateTime expiredAt;
    
    public PasswordResetEvent(String email, String code, int expiration) {
        super();
        this.email = email;
        this.code = code;
        this.expiredAt = getCreatedAt().plusSeconds(expiration);
    }
}
```

&nbsp; 결국 각 구현 타입에 따라 처리할 수도 있지만, 모든 도메인이 공통으로 상속하고 있는 타입 `DomainEvent`를 활용하여 일괄적인 이벤트 저장·발행 로직을 구현할 수 있다.

## DomainEventRecordListener

```java
@Component
@RequiredArgsConstructor
public class DomainEventRecordListener implements DomainEventListener {
    private final EventOutboxService eventOutboxService;
    private final ObjectMapper objectMapper;
    
    @Override
    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void handleEvent(DomainEvent event) {
        try {
            String payload = objectMapper.writeValueAsString(event);
            
            eventOutboxService.save(EventOutbox.fromEvent(event, payload));
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to parse Event - " + event.getEventId(), e);
        }
    }
}
```
&nbsp; `DomainEventRecordListener`는 도메인 이벤트를 `EventOutbox`로 변환하고 저장을 담당하는 리스너이다.

&nbsp; `EventOutbox.payload` 필드에 각 도메인 이벤트를 JSON 문자열로 직렬화하여 저장한다.

&nbsp; 이때 `event.getClass().getName()`으로 구체적인 이벤트 타입을 확인하여 `eventType`에 기록한다. 이를 통해 아웃박스를 조회한 뒤 `payload`를 원래 이벤트 타입의 객체로 역직렬화할 수 있다.


![save-outbox](/assets/img/docs/web/republish-domain-event-1/save-outbox.png)

&nbsp; 이는 TransactionalOutboxPettern의 핵심 아이디어인 '이벤트 영속화'에 해당한다.

&nbsp; Spring Event의 `@TransactionalEventListener`을 활용하여 트랜잭션 커밋 이전 시점(`BEFORE_COMMIT`)에 이벤트 아웃박스를 기록한다.

&nbsp; 커밋 이전 시점에 아웃박스 저장 로직을 실행하여 <u style="font-weight: bold;">핵심 비즈니스 로직 트랜잭션과 원자적으로 실행</u>하도록 한다.

### '여기가'에서는 원자적으로 실행이 되는가?

&nbsp; 위 설명처럼 트랜잭션 아웃박스 패턴의 핵심은 비즈니스 로직을 수행하는 트랜잭션과 아웃박스 기록을 동일한 트랜잭션에 묶어 원자적으로 실행하는 것이다. 두 작업이 하나의 트랜잭션에 참여하면 함께 커밋되거나 롤백되므로, 비즈니스 데이터의 저장과 이벤트 아웃박스의 기록도 원자적으로 수행할 수 있게 된다.

&nbsp; 그러나, '여기가'에서는 이메일 인증·비밀번호 초기화에 사용하는 인증 번호를 Redis에 저장하고, 이벤트 아웃박스는 RDB에 저장한다. 즉, 두 작업은 동일한 원자적 경계 안에 존재하지 않는다는 것이다.

&nbsp; 만약, Redis 저장이 실패하여 예외가 전파되면 이후 내부 이벤트(`DomainEvent`)는 발행되지 않으므로 아웃박스 기록도 되지 않는다. 그러나, Redis에 인증 번호 저장은 성공하였으나 아웃박스의 기록에 실패하면 Redis의 인증 번호는 존재하나, RDB의 아웃박스는 존재하지 않는 불일치가 발생한다. 이 경우 이메일 발송 이벤트가 기록되지 않아 사용자는 인증 번호를 전달받지 못하며, 해당 코드는 TTL이 만료될 때까지 Redis에 남게 된다.

&nbsp; 인증 코드와 아웃박스를 하나의 RDB에 저장하면 두 작업을 동일한 트랜잭션으로 묶어 완전히 원자적으로 실행할 수 있다. Redis 저장을 유지하면서 아웃박스 저장 실패 시 인증 번호를 삭제하는 보상 로직을 추가할 수도 있지만, 보상 동작 자체도 실패할 수 있으므로 Transactional Outbox와 동일한 원자성을 보장하지는 않는다.

&nbsp; 그러나, 현재 프로젝트에서는 인증 번호의 TTL이 3분으로 짧고 불일치가 발생했을 때의 영향도 제한적이라는 점을 고려하여 Redis 저장 방식을 유지하고, 이 위험을 설계상의 트레이드오프로 수용하였다. 따라서 이번 구현은 Transactional Outbox Pattern을 완전히 적용한 구조라기보다, 이벤트 영속화와 재발행 아이디어를 프로젝트 상황에 맞게 적용한 구조로 정의하였다.

# \# 결론

![event-save-process](/assets/img/docs/web/republish-domain-event-1/event-store-process.png)

&nbsp; 이번 포스팅에서는 이벤트 아웃박스 `EventOutbox`의 구조와 아웃박스의 저장 흐름을 작성하였다. 도메인 이벤트 재발행을 위한 구조 중 위 그림의 빨간 표시된 부분이다.

&nbsp; 이벤트 아웃박스 저장 과정에서 중요한 것은 **'모든 도메인 이벤트에 대한 일괄 저장 로직 적용'**과 **'핵심 비즈니스 로직과 이벤트 아웃박스 저장 로직의 원자적 실행'**이다.

&nbsp; Java의 상속과 Spring Event의 `@TransactionalEventListener`를 사용하여 모든 도메인 이벤트를 일괄적으로 저장할 수 있는 이벤트 아웃박스 기록용 리스너를 구현하였다. 따라서, 향후 도메인 이벤트가 더 추가되더라도 별도의 리스너 및 저장 로직 구현이 필요없이 자동으로 이벤트 아웃박스로 변환되어 저장된다.

&nbsp; 그러나, 현재 서비스에 존재하는 도메인 이벤트인 이메일 인증·비밀번호 초기화 이벤트의 핵심 비즈니스 로직인 인증 번호 발급 저장은 Redis에 저장되어 트랜잭션을 통한 롤백 시도가 되지 않는 한계도 확인하였다. 따라서, 이는 Transactional Outbox Pattern의 완벽 적용보다는 '이벤트 아웃박스 영속화' 아이디어를 참고하여 도메인 이벤트 재발행 구조를 도입한 것이라 보는 것이 더 적절하다고 판단하였다.

&nbsp; 완벽한 트랜잭션 아웃박스 패턴으로의 전환을 위해 인증 번호 저장소를 RDB로 이관하거나 보상 트랜잭션 로직을 구현하여 이벤트 아웃박스 기록 실패 시 Redis에 저장된 인증 번호도 롤백하는 방법 등이 존재하지만, 현재 이벤트의 특성과 이벤트 아웃박스 기록 실패 발생율이 낮다는 점을 고려하여 이는 향후 검토 사항으로 남기기로 하였다.

&nbsp; 다음 포스팅에서는 외부 메시지 브로커로 이벤트를 발행하는 과정을 공유햘 것이다. 필자는 MessageRelay(EventPoller)뿐만 아니라 `@TransactionalEventListener`의 `AFTER_COMMIT` 시점을 활용하여 트랜잭션이 완료된 후 바로 이벤트를 발행하는 로직도 구현하였다. 이 2가지 발행 과정은 포스팅을 나누어 서술할 계획이다.