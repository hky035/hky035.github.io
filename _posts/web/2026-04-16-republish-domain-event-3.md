---
layout: posts
title: "도메인 이벤트 재발행 구조 도입기 3 - 이벤트 아웃박스 폴링을 통한 이벤트 발행"
author_profile: true
sidbar:
  nav: "main"
category: "web"
description: "여행 기록 관리 플랫폼 '여기가' 프로젝트를 진행하며, 비밀번호 초기화 이메일 전송 기능 개발을 담당하게 되었다. 기능 구현 후 이메일 전송 보장 기능을 도입해야하는 추가적 이슈가 발생하였다. 여러 방법들을 모색하던 중 '트랙잭션 아웃박스 패턴'에 대해 알게되었다. 이번 포스팅에서는 트랜잭션 아웃박스 패턴 구현 중 이벤트 아웃박스를 주기적으로 조회(폴링)하여 외부 메시지 브로커로 발행해 이벤트의 실행 보장을 구현한 경험을 공유해보고자 한다."
published: true
show_date: true
---

# 서론

&nbsp; 트랜잭션 아웃박스 패턴을 구현하며, 발행자(Publisher)에서 발행된 이벤트는 외부 메시지 브로커(RabbitMQ)로 전달되어야 한다.

&nbsp; 필자는 이벤트 발행을 2가지 단계로 나누어서 처리하였다.

1. 트랜잭션 커밋 이후 즉시 발행 (빠른 이벤트 발행 및 적절한 폴링 주기 사용 목적)
2. 이벤트 아웃박스 폴링을 통한 재발행 (발행 보장)

&nbsp; [이전 포스팅(Transactional Outbox Pattern 도입기 3 - 메시지 브로커 및 이벤트 외부 발행 구조 도입)](/web/tx-outbox-3/)에서는 트랜잭션 커밋 이후 즉시 이벤트를 발행하는 로직에 대해 설명하였다.

&nbsp; 이번 포스팅에서는 Chris Richardson의 [Microservice Architecture - Pattern: Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html)에서 소개하는 Message Relay 개념을 기반으로, 아웃박스를 주기적으로 폴링하여 이벤트를 재발행하는 구조를 적용한 과정을 공유하고자 한다.

# 이벤트 아웃박스 폴링의 목적

&nbsp; 이벤트 아웃박스를 폴링하는 목적은 **이벤트 발행 보장**이다.

&nbsp; 외부 메시지 브로커를 도입하면서 Publisher/Consumer를 논리적·물리적으로 분리하였다. 이를 통해 책임 분리와 장애 격리와 같은 이점을 얻었지만, 이벤트가 메시지 브로커로 정상적으로 발행되어야만 이후 처리가 가능하다.

&nbsp; 트랜잭션 아웃박스 패턴의 궁극적인 목표 역시 **이벤트 처리 실행을 보장**하는 데 있다.

&nbsp; [이벤트를 아웃박스로 변환해 저장](/web/tx-outbox-2/)한 이유 또한, 이벤트를 아웃박스 형태로 영속화하여 메시지 브로커로 발행이 실패하더라도 재발행을 통해 실행을 보장하기 위함이다.

![transactional-outbox-pattern-architecture](/assets/img/docs/web/tx-outbox-4/tx-outbox-pattern-arch.png)

<div style='text-align: center;'>
    <a style='color: #c1c1c1; font-size: 12px' href='https://microservices.io/patterns/data/transactional-outbox.html'>출처: Microservice - Pattern: Transactional Outbox</a>
</div>

&nbsp; Chris Richardson이 소개한 트랜잭션 아웃박스 패턴에서는 **메시지 릴레이(Message Relay)**라는 이름으로 소개된다.

&nbsp; 본 프로젝트에서는 비밀번호 초기화 및 이메일 인증 코드 발송 요청 기능에 이벤트 기반 구조를 도입하여 결합도를 낮추었다. 또한, 실행 보장을 위해 트랜잭션 아웃박스 패턴을 적용하였다.

&nbsp; 도메인 이벤트를 아웃박스의 형태로 저장하고 이를 폴링하는 구조이므로, 해당 컴포넌트(클래스)를 **이벤트 폴러(Event Poller)**라고 명명하였다.

# 폴링 대상 이벤트

&nbsp; 발행자(Publisher)는 이벤트 아웃박스를 조회해 발행해야 한다. 발행 대상 이벤트는 다음과 같다.

- 아직 발행되지 않은 이벤트
- 발행에 실패한 이벤트

&nbsp; 각 이벤트 아웃박스들의 상태는 `WAITING` 또는 `FAILED`이다. 

&nbsp; 또한, 무분별한 재발행을 방지하기 위해 상태 뿐만 아니라 생성 시간(`createdAt`), 실패 횟수(`failCount`) 등을 통해서 조건에 맞는 이벤트만 조회해야한다.

## 1) 아직 발행되지 않은 이벤트

&nbsp; 초기 이벤트 아웃박스 생성 시 상태는 발행대기(`WAITING`) 상태이다.

&nbsp; 트랜잭션 커밋 이후 즉시 발행을 수행하지만, 예기치 못한 이유로 이벤트 외부 발행 리스너가 동작하지 않는 경우 이벤트는 여전히 `WAITING` 상태로 남을 수 있게 된다. 따라서, 즉시 발행되지 않은 이벤트를 폴링해서 재발행해야 한다.

&nbsp; 다만, 아웃박스 생성과 즉시 발행 사이의 짧은 시간 동안 폴링이 수행되면 동일 이벤트가 중복 발행될 수 있기 때문에 이를 방지하기 위해 30초가 지난 아웃박스만 조회하도록 하였다.

![polling-waiting-outbox-max-time](/assets/img/docs/web/tx-outbox-4/polling-waiting-outbox-max-time.png)

&nbsp; 또한, 이벤트에는 유효 시간이 존재한다. 예를 들어 비밀번호 초기화 코드는 3분의 유효 시간을 가지며, 해당 시간이 지난 후 발행되는 이벤트는 의미가 없다. 

&nbsp; 이벤트 조회 시 도메인 이벤트별로 개별 유효 시간을 고려하면 쿼리가 복잡해지는 문제가 있다. 도메인 이벤트의 종류가 늘어날수록 조회 쿼리가 늘어난다는 문제도 존재한다.

&nbsp; 따라서, 가장 긴 유효 시간을 기준으로 조회 범위를 제한하고, 개별 이벤트의 유효성 검증은 소비자 측에서 처리하도록 설계하였다.

&nbsp; 현재 비밀번호 초기화 및 이메일 인증 이벤트의 유효 시간은 모두 3분이므로, 생성 후 3분을 초과한 이벤트는 조회 대상에서 제외된다.

```java
@Service
@RequiredArgsConstructor
public class EventOutboxService {
    private final EventOutboxRepository eventOutboxRepository;
    
    // ...
    private final int WAITING_EVENT_MIN_AGE_SECONDS = 30;
    private final int WAITING_EVENT_MAX_AGE_MINUTES = 3;
    
    public List<EventOutbox> readAllPollingEventOutbox() {
        List<EventOutbox> waitingEventOutboxes = eventOutboxRepository.findByStatusAndCreatedAt(
                EventOutboxStatus.WAITING,
                LocalDateTime.now().minusMinutes(WAITING_EVENT_MAX_AGE_MINUTES),
                LocalDateTime.now().minusSeconds(WAITING_EVENT_MIN_AGE_SECONDS)
        );
    }

    // ...
}
```

&nbsp; 따라서, 폴링 시 이벤트 아웃박스를 조회할 때 생성 후 30초 경과, 3분 이내 이벤트만 조회하도록 한다.

### 개선사항. 이벤트 아웃박스에 expired_at 컬럼을 추가

&nbsp; 현재 구현에서는 각 도메인 이벤트의 유효시간을 기준으로 `EventOutboxService`의 `WAITING_EVENT_MAX_AGE_MINUTES` 값을 설정해야 한다. 현재는 모든 도메인 이벤트의 유효 시간이 3분으로 동일하지만, 서로 다른 유효 시간을 가진 이벤트가 추가된 경우 해당 값을 직접 수정해야한다. 이는 도메인 이벤트에 암묵적으로 의존하는 결합으로 이어진다.

&nbsp; 또한, 상대적으로 유효 시간이 짧은 이벤트는 다른 이벤트의 유효 시간으로 인해 일단 조회되어 소비자에서 이를 필터링하게 된다. 그러나 이 방식의 문제점은 결국 유효 시간이 지난 `WAITING` 이벤트도 발행하게 되어 불필요한 자원 낭비로 이어질 수 있다.

&nbsp; 이러한 문제점을 해결하기 위해 이벤트 아웃박스에 `expired_at` 컬럼을 추가할 수 있다. 이를 통해 현재 시간을 기준으로 유효 시간이 지난 이벤트는 조회 대상에서 제외되도록 할 수 있다.

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

    // ⭐️ expired_at 컬럼 추가
    @Column(name = "expired_at")
    private LocalDateTime expiredAt;
    
    @Column(name = "fail_count")
    private int failCount;

    // ...
}
```

이후, 이벤트 아웃박스 조회 시 현재 시간이 `expired_at`보다 지난 아웃박스 레코드들은 조회하지 않도록 한다.

## 2) 발행에 실패한 이벤트

&nbsp; 이벤트 발행을 시도했지만, 메시지 브로커 에러 등의 이유로 실패할 수 있다.

&nbsp; 발행에 실패한 이벤트의 상태는 발행 실패(`FAILED`)로, 유효 시간 내에 재시도를 진행해야한다.

&nbsp; `WAITING` 상태의 아웃박스를 조회할 때 생성 시간을 통해 필터링하여 조회하였듯, `FAILED` 상태의 이벤트는 실패 횟수(`failCount`)를 통해 폴링 대상 아웃박스를 필터링한다.

### 발행 실패 이벤트 재발행 기준: 실패 횟수 vs 만료 기한

&nbsp; 본 프로젝트에서 트랜잭션 아웃박스 패턴을 적용한 대상은 유효 기간이 존재하는 이벤트이다.

&nbsp; 그러나 트랜잭션 아웃박스 패턴은 이메일 발송과 같은 부가 로직의 실행 보장 뿐만 아니라, MSA 환경에서 모듈 간 데이터 정합성을 유지하기 위한 방법으로도 사용된다. 이러한 경우에는 이벤트의 유효 기간이 존재하지 않으며, 데이터의 정합성이 궁극적으로 보장되어야한다는 책임만 존재한다.

&nbsp; 이벤트 발행 실패의 주요 원인은 메시지 브로커의 장애이다. 장애가 지속되는 상황에서는 재발행을 시도하더라도 동일하게 실패할 가능성이 높다. 또한, 메시지 자체가 잘못된 경우에도 반복적인 발행 실패가 발생한다. 따라서, 별도의 제한 없이 재발행을 시도할 경우, 실패할 이벤트를 지속적으로 발행하게 되어 불필요한 자원 낭비로 이어진다.

&nbsp; 이러한 문제를 방지하기 위해 실패 횟수 `failCount`를 기준으로 재발행 횟수를 제한할 수 있다. 일정 횟수 이상 실패한 이벤트는 더 이상 자동 재발행하지 않고, 메시지 브로커 복구 이후 별도의 배치 작업을 통해 수동으로 발행하거나, 다른 모듈과 데이터 동기화 작업을 별도로 실시하여 정합성을 맞추도록 할 수 있다.

&nbsp; 한편, `failCount` 대신 만료 기한(`expiredAt`)을 기준으로 실패한 이벤트를 필터링하는 방식도 고려할 수 있다. 그러나, `FAILED` 상태의 이벤트는 이미 발행에 실패한 이력이 있기 때문에 만료 기한 내 재시도를 하더라도 지속적으로 실패할 수 있다. 더불어 만료 기한이 긴 이벤트의 경우에는 해당 기한동안 지속적으로 재발행을 시도하게 되어 시스템 부하를 일으킬 수 있다.

&nbsp; 따라서, 현재 구현에서는 `failCount`를 기준으로 재발행 횟수를 제한하고, 3회 이상 실패한 이벤트는 더 이상 조회 대상에서 제외하도록 설계하였다.

```java
@Service
@RequiredArgsConstructor
public class EventOutboxService {
    private final EventOutboxRepository eventOutboxRepository;
    
    private final int MAX_FAIL_COUNT = 3;
    private final int WAITING_EVENT_MIN_AGE_SECONDS = 30;
    private final int WAITING_EVENT_MAX_AGE_MINUTES = 3;
    
    public List<EventOutbox> readAllPollingEventOutbox() {
        // 발행 대기 중인 이벤트를 조회
        // 생성 후 30초 뒤, 생성 후 3분 이내 이벤트만 조회
        List<EventOutbox> waitingEventOutboxes = eventOutboxRepository.findByStatusAndCreatedAt(
                EventOutboxStatus.WAITING,
                LocalDateTime.now().minusMinutes(WAITING_EVENT_MAX_AGE_MINUTES),
                LocalDateTime.now().minusSeconds(WAITING_EVENT_MIN_AGE_SECONDS)
        );
        
        // 발행에 실패한 이벤트를 조회
        // 3회 미만 실패한 이벤트만 조회
        List<EventOutbox> failedEventOutboxes = eventOutboxRepository.findByStatusAndFailCount(
                EventOutboxStatus.FAILED,
                MAX_FAIL_COUNT
        );
        
        return Stream.concat(waitingEventOutboxes.stream(), failedEventOutboxes.stream()).collect(Collectors.toList());
    }

    // ...
}
```

&nbsp; 해당 도메인 서비스 클래스 `EventOutboxService`의 `readAllPoolingEventOutbox()` 메서드는 `WAITING` 상태의 이벤트와 `FAILED` 상태의 이벤트를 조회한 뒤, 이를 하나의 리스트로 병합하여 반환한다.

# JSON 문자열 타입의 이벤트 발행

![publish-event](/assets/img/docs/web/tx-outbox-4/publish-event.png)

&nbsp; 위 코드는 RabbitMQ로 메시지를 발행하는 `RabbitMQEventPublisher.publish(DomainEvent)` 메서드이다.

&nbsp; 해당 메서드는 `@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)` 리스너에 의해서 트랜잭션 커밋 이후 시점에서 전달되는 도메인 이벤트 객체를 발행하는데 사용된다.

&nbsp; 메서드 내부에서 `RabbitTemplate.convertAndSend(...)`를 호출하여 도메인 이벤트 객체를 JSON 형태로 직렬화한 뒤 메시지 브로커로 전송한다. 

```java
@Configuration
public class RabbitMQConfig {
    @Bean
    public RabbitTemplate rabbitTemplate(ConnectionFactory connectionFactory) {
        RabbitTemplate rabbitTemplate = new RabbitTemplate(connectionFactory);
        rabbitTemplate.setMessageConverter(jackson2JsonMessageConverter());
        return rabbitTemplate;
    }
    
    @Bean
    public MessageConverter jackson2JsonMessageConverter() {
        return new Jackson2JsonMessageConverter();
    }
}
```

&nbsp; RabbitMQ 관련 빈 등록 시, `Jackson2JsonMessageConverter`를 메시지 컨버터로 설정하였다.

&nbsp; 따라서, Java 객체를 전달할 경우 내부적으로 JSON 직렬화 과정을 거치며 `RabbitTemplate.convertAndSend(...)`를 사용하게 된다.

&nbsp; 그러나, 이벤트 아웃박스 폴링을 통해 발행하는 경우에는, 데이터베이스에 저장된 아웃박스를 기반으로 메시지를 생성해야한다.

&nbsp; 이벤트 아웃박스 엔티티(`EventOutbox`)의 `payload` 컬럼에는 도메인 이벤트가 JSON 문자열 형태로 저장되어있다. 따라서, `RabbitMQEventPublisher.publish(DomainEvent)`를 사용하려면, 해당 문자열을 다시 도메인 객체로 역직렬화하는 과정이 필요하다.

&nbsp; 이 과정을 불필요한 변환 비용을 발생시키므로, JSON 문자열을 그대로 발행하는 방식을 선택하였다. 이를 위해 [`RabbitTemplate.send(...)`](https://docs.spring.io/spring-amqp/docs/current/api/org/springframework/amqp/rabbit/core/RabbitTemplate.html#send(java.lang.String,java.lang.String,org.springframework.amqp.core.Message,org.springframework.amqp.rabbit.connection.CorrelationData))을 사용하면 역직렬화없이 문자열 기반 메시지를 직접 전송할 수 있다.

&nbsp; 따라서, 이벤트 아웃박스에 저장된 `payload`를 그대로 활용하여 메시지를 발행할 수 있도록, `RabbitMQEventPublisher`에 문자열 기반 발행 메서드를 추가하였다.

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class RabbitMQEventPublisher implements DomainEventExternalPublisher {
    private final RabbitTemplate rabbitTemplate;
    private final RabbitMQPropertyResolver rabbitMQPropertyResolver;
    
    // ...
    
    /**
     * RabbitMQ 메시지브로커로 문자열 형태의 이벤트를 발행하는 메서드
     *
     * <p> {@code CorrelationData}를 통해 메시지브로커로의 발행 여부를 확인
     *
     * <p>
     *
     * @param eventId   이벤트 식별자(ULID)
     * @param eventType 도메인 이벤트 클래스 타입
     * @param payload   이벤트 객체를 JSON 형태로 변환한 문자열
     * @return          실행 결과 {@link EventPublishResult}를 감싸고 있는 {@code CompletableFuture} 객체
     */
    public CompletableFuture<EventPublishResult> publishRaw(String eventId, String eventType, String payload) {
        CorrelationData correlationData = new CorrelationData(eventId);
        
        CompletableFuture<EventPublishResult> result = correlationData.getFuture().thenApply(confirm -> {
            if (confirm.isAck()) {
                return EventPublishResult.success(eventId);
            } else {
                return EventPublishResult.fail(eventId, confirm.getReason());
            }
        }).exceptionally(ex -> EventPublishResult.fail(eventId, ex.getMessage()));
        
        try {
            Message message = MessageBuilder
                    .withBody(payload.getBytes(StandardCharsets.UTF_8))
                    .setContentType(MessageProperties.CONTENT_TYPE_JSON)
                    .build();

            rabbitTemplate.send(
                    rabbitMQPropertyResolver.getPublishExchange(eventType),
                    rabbitMQPropertyResolver.getPublishRoutingKey(eventType),
                    message,
                    correlationData
            );
        } catch (Exception e) {
            result.complete(EventPublishResult.fail(eventId, e.getMessage()));
        }
        
        return result;
    }
}
```

&nbsp; `CorrelationData`를 통한 Publish Confirm 결과 수신 및 `EventPublishResult` 객체 변환 로직은 기존과 동일하다.

&nbsp; `RabbitTemplate.convertAndSend(...)` 대신 `RabbitTemplate.send(...)`를 사용하기 때문에 JSON 문자열 형태의 이벤트를 `Message` 객체로 생성하여 전달해야 한다.

&nbsp; 이때, `payload`를 바이트 배열 형태로 설정하고, Content-Type을 JSON으로 명시한다.

&nbsp; 이처럼 메시지의 콘텐츠 타입을 지정하면 `Jackson2JsonMessageConverter`를 사용하는 수신자(Consumer)에서 JSON 메시지를 Java 객체로 역직렬화할 수 있다.

# 이벤트 폴링 주기

&nbsp; 이벤트 폴러(Message Relay)를 통해서 주기적으로 이벤트 아웃박스를 조회하여, 미발행 이벤트와 발행에 실패한 이벤트를 재발행해야 한다.

&nbsp; 이때 폴링 주기는 시스템 성능에 직접적인 영향을 미친다. 폴링 주기가 길면 한 번에 많은 이벤트를 처리하게 되어 부하가 증가할 수 있고, 반대로 주기가 너무 짧으면 잦은 조회 쿼리로 인해 DBMS에 부담을 줄 수 있다.

&nbsp; 본 프로젝트에서는 Spring Event를 통해 트랜잭션 커밋 이후 즉시 이벤트를 발행하는 구조를 함께 사용하고 있다. 따라서, 대부분의 이벤트는 즉시 발행 단계에서 처리되며 폴러에 의해 조회되는 아웃박스의 수는 많지 않다. 이에 따라 이벤트 폴링 주기는 30초로 설정하였다. 

&nbsp; 이것이 Spring Event를 통하여 컴시 완료 시점에 이벤트 발행 기능을 도입한 이유이기도 하다.

# 폴링한 이벤트 발행

&nbsp; 이제 실제로 조회(폴링)한 이벤트를 발행해야한다.

```java
@Slf4j
@Service
@RequiredArgsConstructor
public class EventOutboxPoller {
    private final EventOutboxService eventOutboxService;
    private final DomainEventExternalPublisher eventExternalPublisher;
    private final Executor messagePublishTaskExecutor;
    
    /**
     * 주기적으로 이벤트 아웃박스를 조회하여, 재발행을 시도하는 폴링 메서드
     *
     * <p> 30초마다 미발행 및 발행 실패 이벤트 아웃박스를 조회하여 재발행 시도
     *
     * <p> 미발행 이벤트의 경우에는 초기 발행 시점과 동시성 문제를 예방 및 이벤트 최대 유효 시간을 고려하여 하고자 생성 후 30초 후, 3분 이내의 이벤트만을 조회
     *
     * <p> 재발행 후 상태 업데이트
     */
    @Scheduled(fixedRate = 30, timeUnit = TimeUnit.SECONDS)
    public void poll() {
        List<EventOutbox> eventOutboxes = eventOutboxService.readAllPollingEventOutbox();
        
        // 조회한 이벤트 아웃박스들을 발행
        List<CompletableFuture<EventPublishResult>> results = eventOutboxes.stream()
                .map(eventOutbox -> CompletableFuture.supplyAsync(
                                eventPublishTask(eventOutbox),
                                messagePublishTaskExecutor
                        )
                        .thenCompose(future -> future)
                        .exceptionally(ex -> {
                            log.error("Failed to published event \"{}\"", eventOutbox.getEventId(), ex);
                            return EventPublishResult.fail(eventOutbox.getEventId(), ex.getMessage());
                        })
                )
                .toList();
        
        // 모든 이벤트 아웃박스에 대한 메시지 발행이 될 때까지 대기
        CompletableFuture.allOf(results.toArray(new CompletableFuture[0])).join();
        
        // 메시지 발행이 모두 완료되고 난 다음, 이벤트 아웃박스들의 상태를 업데이트
        updateStatus(results);
    }

    // ...
}
```

&nbsp; 이벤트 폴러(`EventOutboxPoller`)는 주기적으로 이벤트 아웃박스를 조회한 뒤, 각 이벤트에 대해 비동기적으로 발행 작업을 수행한다.

&nbsp; 이벤트 발행 시에는 [이전 포스팅](/web/tx-outbox-3/)에서 정의한 `MessagePublishTaskExecutor` 쓰레드풀을 사용한다. 이를 통해 여러 이벤트를 병렬로 처리하여 발행 시 처리량을 높일 수 있다.

&nbsp; 쓰레드풀을 지정하여 이벤트 발행 작업을 실행하기 위해 [`CompletableFuture.supplyAsync(Supplier, Executor)`](https://docs.oracle.com/javase/8/docs/api/java/util/concurrent/CompletableFuture.html#supplyAsync-java.util.function.Supplier-java.util.concurrent.Executor-) 정적 메서드를 사용한다. 첫 번째 인자로 실행할 작업을 `Suppllier`로 제공하며, 작업을 실행할 쓰레드풀을 두 번째 인자로 지정한다.

&nbsp; 이때 각 이벤트 발행 작업은 별도의 비동기 작업으로 실행되며, 실행 결과는 `CompletableFuture<EventPublishResult>` 형태로 반환된다.

```java
/**
 * 이벤트 아웃박스 발행 작업을 나타내는 Supplier 메서드
 *
 * @param eventOutbox 이벤트 아웃박스
 * @return 이벤트 메시지 발행 결과 CompletableFuture 객체를 감싸는 Supplier
 */
private Supplier<CompletableFuture<EventPublishResult>> eventPublishTask(EventOutbox eventOutbox) {
    return () -> eventExternalPublisher.publishRaw(
            eventOutbox.getEventId(), eventOutbox.getEventType(), eventOutbox.getPayload()
    );
}
```

&nbsp; 이벤트 발행 작업은 `Supplier` 함수형 인터페이스로 넘겨준다.

&nbsp; 앞서 정의한 `DomainEventExternalPublisher`의 구현체인 `RabbitMQEventPublisher.publishRaw(...)` 메서드를 실행할 작업으로 정의한다.

&nbsp; `.publishRaw(...)`의 반환값은 `CorrelationData`의 결과값을 받아 비동기적으로 처리되는 `CompletableFuture<EventPublishResult>`이다. 이는 `Supplier`가 반환하는 실제 객체이다.

&nbsp; 한편 `CompletableFuture.supplyAsync(...)`는 이벤트 발행 실행 결과를 감싸는 `CompletableFuture`를 반환하므로, 전체 반환 타입은 `CompletableFuture<CompletableFuture<EventPublishResult>>`가 된다. 따라서, `.thenCompose(future -> future)`를 통해 중첩된 `CompletableFuture`를 제거한다.

&nbsp; 이 과정에서 예외가 발생하면 실패 상태의 `EventPublishResult`를 반환하도록 처리한다.

&nbsp; 최종적으로 각 이벤트의 발행 결과는 `List<CompletableFuture<EventPublishResult>> results`에 저장되며, 이후 결과에 따라 이벤트 아웃박스의 상태를 갱신한다.

```java
// 모든 이벤트 아웃박스에 대한 메시지 발행이 될 때까지 대기
CompletableFuture.allOf(results.toArray(new CompletableFuture[0])).join();
```

&nbsp; 모든 이벤트 아웃박스에 대한 메시지 발행이 완료될 때까지 대기한다.

&nbsp; 이는 모든 이벤트가 발행이 완료되고 난 후 일괄적으로 상태 갱신 작업을 수행하기 위한 목적으로, `CompletableFuture.allOf(CompletableFuture...).join()`을 사용하여 모든 비동기 이벤트 발행 작업이 종료될 때까지 블로킹한다.

## 이벤트 상태 갱신

```java
/**
 * 이벤트 메시지 발행 결과를 바탕으로 이벤트 아웃박스 상태{@code status}를 업데이트하는 메서드
 *
 * <p> 메서드 호출부에서 모든 이벤트 아웃박스에 대한 메시지 발행이 되기까지 대기하였으므로 결과 객체{@link EventPublishResult}를 즉시 반환
 *
 * <p> 대기 및 실패 이벤트 수를 고려하여 일괄 업데이트 수행
 *
 * @param results 이벤트 메시지 발행 결과 CompletableFuture 리스트
 */
private void updateStatus(List<CompletableFuture<EventPublishResult>> results) {
    List<String> publishedEventIds = new ArrayList<>();
    List<String> failedEventIds = new ArrayList<>();
    
    results.stream()
            .map(result -> result.join())
            .forEach(result -> {
                if (result.isSuccess()) {
                    publishedEventIds.add(result.eventId());
                } else {
                    failedEventIds.add(result.eventId());
                }
            });
    
    if (!publishedEventIds.isEmpty()) {
        eventOutboxService.updateToPublishedByEventIds(publishedEventIds);
    }
    if (!failedEventIds.isEmpty()) {
        eventOutboxService.updateToFailedByEventsIds(failedEventIds);
    }
}
```

&nbsp; 폴링을 통해 이벤트 발행이 완료되면, Publish Confirm 결과를 바탕으로 이벤트 아웃박스의 상태를 갱신해야 한다.

&nbsp; 이는 `EventPoller.updateStatus(List<CompletableFuture<EventPublishResult>> results)` 메서드에서 수행하게 된다.

&nbsp; 발행 결과 리스트를 순회하며 각 이벤트의 성공 여부에 따라 성공 이벤트 ID와 실패 이벤트 ID를 구분하여 저장한 뒤, 이를 기반으로 상태를 일괄 업데이트한다.

# EventPoller 전체 코드

```java
@Slf4j
@Service
@RequiredArgsConstructor
public class EventOutboxPoller {
    private final EventOutboxService eventOutboxService;
    private final DomainEventExternalPublisher eventExternalPublisher;
    private final Executor messagePublishTaskExecutor;
    
    /**
     * 주기적으로 이벤트 아웃박스를 조회하여, 재발행을 시도하는 폴링 메서드
     *
     * <p> 30초마다 미발행 및 발행 실패 이벤트 아웃박스를 조회하여 재발행 시도
     *
     * <p> 미발행 이벤트의 경우에는 초기 발행 시점과 동시성 문제를 예방 및 이벤트 최대 유효 시간을 고려하여 하고자 생성 후 30초 후, 3분 이내의 이벤트만을 조회
     *
     * <p> 재발행 후 상태 업데이트
     */
    @Scheduled(fixedRate = 30, timeUnit = TimeUnit.SECONDS)
    public void poll() {
        List<EventOutbox> eventOutboxes = eventOutboxService.readAllPollingEventOutbox();
        
        // 조회한 이벤트 아웃박스들을 발행
        List<CompletableFuture<EventPublishResult>> results = eventOutboxes.stream()
                .map(eventOutbox -> CompletableFuture.supplyAsync(
                                eventPublishTask(eventOutbox),
                                messagePublishTaskExecutor
                        )
                        .thenCompose(future -> future)
                        .exceptionally(ex -> {
                            log.error("Failed to published event \"{}\"", eventOutbox.getEventId(), ex);
                            return EventPublishResult.fail(eventOutbox.getEventId(), ex.getMessage());
                        })
                )
                .toList();
        
        // 모든 이벤트 아웃박스에 대한 메시지 발행이 될 때까지 대기
        CompletableFuture.allOf(results.toArray(new CompletableFuture[0])).join();
        
        // 메시지 발행이 모두 완료되고 난 다음, 이벤트 아웃박스들의 상태를 업데이트
        updateStatus(results);
    }
    
    /**
     * 이벤트 아웃박스 발행 작업을 나타내는 Supplier 메서드
     *
     * @param eventOutbox 이벤트 아웃박스
     * @return 이벤트 메시지 발행 결과 CompletableFuture 객체를 감싸는 Supplier
     */
    private Supplier<CompletableFuture<EventPublishResult>> eventPublishTask(EventOutbox eventOutbox) {
        return () -> eventExternalPublisher.publishRaw(
                eventOutbox.getEventId(), eventOutbox.getEventType(), eventOutbox.getPayload()
        );
    }
    
    /**
     * 이벤트 메시지 발행 결과를 바탕으로 이벤트 아웃박스 상태{@code status}를 업데이트하는 메서드
     *
     * <p> 메서드 호출부에서 모든 이벤트 아웃박스에 대한 메시지 발행이 되기까지 대기하였으므로 결과 객체{@link EventPublishResult}를 즉시 반환
     *
     * <p> 대기 및 실패 이벤트 수를 고려하여 일괄 업데이트 수행
     *
     * @param results 이벤트 메시지 발행 결과 CompletableFuture 리스트
     */
    private void updateStatus(List<CompletableFuture<EventPublishResult>> results) {
        List<String> publishedEventIds = new ArrayList<>();
        List<String> failedEventIds = new ArrayList<>();
        
        results.stream()
                .map(result -> result.join())
                .forEach(result -> {
                    if (result.isSuccess()) {
                        publishedEventIds.add(result.eventId());
                    } else {
                        failedEventIds.add(result.eventId());
                    }
                });
        
        if (!publishedEventIds.isEmpty()) {
            eventOutboxService.updateToPublishedByEventIds(publishedEventIds);
        }
        if (!failedEventIds.isEmpty()) {
            eventOutboxService.updateToFailedByEventsIds(failedEventIds);
        }
    }
}
```

# Summary

&nbsp; 이번 포스팅에서는 트랜잭션 아웃박스 패턴 구현 중 이벤트 폴러(Message Relay)를 적용한 내용을 정리하였다.

&nbsp; 트랜잭션 아웃박스 패턴은 실행 보장을 위해 도입된 패턴으로, 이벤트 아웃박스 폴러를 통해 저장된 아웃박스를 주기적으로 조회하여 메시지 브로커로 발행함으로써 발행 보장을 책임지는 핵심 메커니즘이다.

&nbsp; RabbitMQ의 `Jackson2JsonMessageConverter`를 통해 JSON 문자열 형태로 저장된 이벤트를 즉시 발행하고, Publish Confirm 결과를 통해 발행된 이벤트 아웃박스의 상태를 갱신하였다. 이를 통해 외부 메시지 브로커의 기능을 활용한 효율적인 이벤트 발행 구조를 구현할 수 있었다.

&nbsp; 아웃박스 폴링 자체는 비교적 단순했지만, 이 과정에서 Publish Confirm 결과 수신을 위한 `CorreltationData` 사용 및 메시지 발행을 위한 별도의 쓰레드풀 도입으로 비동기 처리에 대한 고려가 필요했다. 이 과정에서 `CompletableFuture`를 활용한 비동기 처리 방식에 대해 깊이있게 학습할 수 있었다.

&nbsp; 또한, 아웃박스 조회 및 발행이라는 기본 개념은 단순했지만, 이벤트 유효 시간 관리와 비동기 처리 전략 등 도메인 특성에 따른 설계 고민이 필요했다.

&nbsp; 이번 포스팅을 통해 이벤트 아웃박스에 `expired_at` 컬럼을 추가하고, 폴링 시 유효 시간을 기준으로 필터링하는 개선 방안을 도출할 수 있었으며, 이를 통해 보다 효율적인 이벤트 발행 구조로 발전 시킬 수 있었다