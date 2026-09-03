---
layout: posts
title: "도메인 이벤트 재발행 구조 도입기 3 - 이벤트 아웃박스 폴링을 통한 이벤트 발행"
author_profile: true
sidbar:
  nav: "main"
category: "web"
description: "&nbsp; 여행 기록 관리 플랫폼 '여기가' 프로젝트를 진행하며 이메일 인증·비밀번호 초기화 이메일 전송 기능 개발을 담당하게 되었다. 이메일 전송은 외부 메일 서버를 거쳐 실행되는 작업으로 Network I/O 등 시간이 오래 걸리는 작업이다. 따라서, 핵심 비즈니스 로직과 이메일 발송 로직을 분리하여 결합도를 낮추고, 향후 메일 서버 분리의 확장성을 염두에 두고 이메일 발송 로직을 이벤트 기반 아키텍처(EDA)로 분리하였다. EDA 도입 후 메시지 브로커로 이벤트가 발행되지 않아 이벤트가 유실되는 문제를 겪고 이에 대한 해결 방법을 모색하던 중 'Transactional Outbox Pattern'을 알게 되었다. 이번 포스팅에서는 저장된 이벤트 아웃박스를 폴링하여 실패·미발행 이벤트를 발행하는 구조를 구현한 경험을 공유하고자 한다."
published: true
show_date: true
---

# 서론

&nbsp; [이전 포스팅(도메인 이벤트 재발행 구조 도입기 2 - 커밋 직후 발행과 RabbitMQ Publish Confirm)](/web/tx-outbox-3/)에서는 트랜잭션 커밋 이후 즉시 이벤트를 외부 메시지 브로커로 발행하는 로직에 대해 설명하였다.

&nbsp; 그러나 이는 '여기가' 서비스에 유효 시간이 존재하는 이메일 인증·비밀번호 초기화 이벤트에 대한 빠른 처리를 위한 구조이며, 해당 발행도 트랜잭션 커밋 이후 한 번이 실행이 될 뿐이다. 즉, 해당 발행에서도 메시지 발행이 실패할 수 있다는 것이다.

&nbsp; 따라서, 도메인 이벤트 생성 서비스에서 <u>이벤트 발행의 책임을 지기 위해서 필요한 것은 실패·미발행 이벤트를 주기적으로 조회(폴링)하여 발행</u>하는 EventPoller 이다.

&nbsp; 이는 Chris Richardson의 [Microservice Architecture - Pattern: Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html)에서 소개하는 Message Relay 개념과 동일히다.

# 본론

# \# 이벤트 폴링은 왜 필요한가?

&nbsp; 이벤트를 주기적으로 폴링해야하는 이유는 실패·미발행 이벤트가 존재하기 때문이다. 

&nbsp; 우선, 메시지 브로커의 장애 등으로 인하여 `AFTER_COMMIT` 시점에서 이벤트 발행이 실패할 경우 이벤트 아웃박스의 상태는 `FAILED`가 된다. 또한, 폴링을 통한 이벤트 발행이 실패했을 때도 동일하다.

&nbsp; 또한, `AFTER_COMMIT` 로직이 실행되기 전에 서버가 예기치 못하게 종료가 되거나, 이벤트 아웃박스 상태 갱신이 제대로 이루어 지지 않는 상황이 생긴다면 이벤트는 여전히 `WAITING`(미발행) 상태가 된다.

&nbsp; 따라서, 실패(`FAILED`), 미발행(`WAITING`) 이벤트를 발행하기 위해 주기적으로 폴링이 필요한 것이다.


# \# 이벤트를 조회하는 대안

&nbsp; 이벤트를 조회하는 방법으로 폴링 방식만 존재하는 것은 아니다.

&nbsp; 트랜잭션 아웃박스 패턴을 적용한 기술 블로그 자료 등을 참고하면 트랜잭션의 로그를 읽는 Transaction Log Tailing이나 CDC(Change Data Capture) 방식을 통해 이벤트를 조회하여 외부 메시지 브로커로 발행하기도 한다.

&nbsp; 그러나, 이것은 복잡한 구현 방식을 가지기 때문에 필자는 애플리케이션에서 실패·미발행 이벤트 아웃박스를 조회하여 발행하는 폴링 방식을 선택하여 구현하였다.

# \# 이벤트의 상태

&nbsp; 이전 포스팅들에서도 이벤트의 상태를 언급하였듯이 이벤트 아웃박스는 `WAITING` / `PUBLISHED` / `FAILED` 상태를 가진다.

&nbsp; `PUBLISHED` 상태를 제외한 미발행, 실패 상태의 이벤트를 주기적으로 조회하여 발행해야 하는 것이다.

## \## 미발행 이벤트의 조회

&nbsp; 미발행 이벤트는 `BEFORE_COMMIT` 커밋에서 이벤트 아웃박스가 기록될 때 정해지는 초기값이다. 즉, `BEFORE_COMMIT`과 `AFTER_COMMIT` 사이의 이벤트일 수도 있다.

&nbsp; 따라서, 미발행 이벤트 조회 시점이 `BEFORE_COMMIT`과 `AFTER_COMMIT` 시점과 겹친다면 미발행 이벤트는 2번 발행이 된다.

&nbsp; 트랜잭션 아웃박스 패턴은 at-least once delivery(최소한 한 번은 전달)를 보장하기 때문에 여러 번 발행을 해도 문제가 없고, 이벤트를 처리하는 소비자(Consumer)에서 **멱등성을 보장하기 위해 이미 처리한 이벤트의 `eventId`는 기록하여 부가 로직의 재실행을 막을 수** 있다. 

&nbsp; '여기가'에서는 `AFTER_COMMIT` 시점에 이벤트를 즉시 발행하는 로직이 대부분 성공한다. 따라서, 미발행 상태의 이벤트 폴링을 통해 발행되는 이벤트의 양이 그리 많지 않을 것이라고 판단하여 생성된지 30초가 지난 미발행 이벤트만 조회하도록 하였다. 이는 도메인 이벤트 발행자(Publisher)에서 한 번 더 발행 경로 간 경합을 낮추기 위한 선택이다.

&nbsp; 또한, 유효 기간이 존재하는 도메인 이벤트이기에 유효 기간이 지난 이벤트는 더 이상 조회 대상에서 제외한다.

## \# 실패 이벤트의 조회

&nbsp; 발행 실패 이벤트는 `AFTER_COMMIT` 시점 또는 이벤트 폴링을 통한 발행에 실패한 상태이다. 따라서, 폴링을 통해 주기적으로 재발행을 시도해야한다.

&nbsp; 그러나, 발행에 실패한 이벤트를 계속해서 재발행할 경우 이는 영구적인 반복을 초래하고, 짧은 반복 시간은 장애 상태를 악화 시킬 수 있다.

&nbsp; 따라서, `EventOutbox`에는 `failCount` 필드를 두어 재시도 횟수를 관리하고 일정 수준의 재시도 횟수를 초과한 이벤트는 더 이상 재시도 하지 않는다. 또한, `lastRetriedAt` 컬럼을 통해 최종 재시도 시각을 기록하여 빠른 시간 내 재시도를 방지하였다.

&nbsp; 여기가와 달리 MSA에서 CUD 작업의 결과로 변경 사항을 다른 서비스로 알리기 위해 발행하는 이벤트는 단순히 재시도를 멈추기만 하면 데이터 정합성이 어긋나는 문제가 발생한다. 따라서, 재발행은 멈추더라도 타 서비스에서 해당 서비스로 요청을 보내 데이터를 동기화 시키는 작업도 주기적으로 실시한다는 내용을 확인할 수 있었다.

# \# EventPoller 구현

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

```java
@Service
@RequiredArgsConstructor
public class EventOutboxService {
    private final EventOutboxRepository eventOutboxRepository;
    
    private final int MAX_FAIL_COUNT = 3;
    private final int WAITING_EVENT_MIN_AGE_SECONDS = 30;
    private final int WAITING_EVENT_MAX_AGE_MINUTES = 3;
    
    public List<EventOutbox> readAllPollingEventOutbox() {
        List<EventOutbox> waitingEventOutboxes = eventOutboxRepository.findByStatusAndCreatedAt(
                EventOutboxStatus.WAITING,
                LocalDateTime.now().minusMinutes(WAITING_EVENT_MAX_AGE_MINUTES),
                LocalDateTime.now().minusSeconds(WAITING_EVENT_MIN_AGE_SECONDS)
        );
        
        List<EventOutbox> failedEventOutboxes = eventOutboxRepository.findByStatusAndFailCount(
                EventOutboxStatus.FAILED,
                MAX_FAIL_COUNT
        );
        
        return Stream.concat(waitingEventOutboxes.stream(), failedEventOutboxes.stream()).collect(Collectors.toList());
    }

    // ...
}
```

```java
public interface DomainEventExternalPublisher {
    CompletableFuture<EventPublishResult> publish(DomainEvent event);
    CompletableFuture<EventPublishResult> publishRaw(String eventId, String eventType, String payload);
}
```

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

&nbsp; 실패·미발행 이벤트는 30초 간격으로 조회하여 발행한다.

&nbsp; 현재 도메인 이벤트는 유효 시간이 만료되기 전 이벤트를 발행하는 것이 우선이라고 판단하여 실패·미발행 이벤트를 동시에 조회하여 이를 발행한다. 

&nbsp; 이벤트 발행기는 `RabbitMQEventPublisher`로 트랜잭션 커밋 이후 즉시 발행에 사용했던 클래스와 동일하다.

&nbsp; 그러나 이벤트 아웃박스 폴링을 통한 발행에서는 `DomainEvent` 객체가 아닌 "JSON 문자열"을 바로 발행하는 `rabbitTemplate.send(...)` 메서드를 사용한다. 이는 `RabbitTemplate` 빈 등록 시 `Jackson2JsonMessageConverter`를 컨버터로 사용했기 때문에 JSON 형태의 문자열을 보내면 이후 소비자(Consumer)에서도 이를 바로 역직렬화하여 사용할 수 있다.

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

    // ...
}
```

&nbsp; 따라서, 폴링을 통한 이벤트 발행 시에는 불필요한 직렬화 과정을 생략하기에 성능상 이점도 존재한다. 또한, 저장된 메시지(도메인 이벤트)의 원본을 그대로 발행한다는 것또한 타 서비스간 중요한 신뢰성을 보장한다.

&nbsp; 또한, 이 경우에도 발행 후 Publish Confirm 여부에 따라 이벤트 상태를 갱신해야하므로 조회한 모든 이벤트의 발행 성공 여부를 비동기적을 수신받으면 결과에 따라 이벤트 아웃박스의 상태를 갱신한다.

# 결론

&nbsp; 도메인 이벤트가 발생한 서비스에서는 이벤트 발행의 책임을 가진다. 이벤트를 아웃박스로 영속화하는 것을 넘어 실제로 발행하는 것까지가 책임이다. 

&nbsp; '여기가'는 `AFTER_COMMIT` 시점에서 이벤트를 발행하기도 한다. 그러나 이는 유효 시간이 존재하는 이벤트의 발행 속도를 높이기 위한 선택이지 이벤트 발행을 보장하는 선택은 아니다.

&nbsp; 트랜잭션 아웃박스 패턴에서도 이벤트 아웃박스 폴링을 통한 발행을 기본 개념으로 설명하듯, 이벤트 아웃박스 폴링이 발행을 보장한다. 

&nbsp; 이벤트 아웃박스 폴링 시에는 실패·미발행 상태의 이벤트를 조회한다. 본 서비스에서는 `AFTER_COMMIT` 시점에서도 이벤트를 발행하기 때문에 자칫하면 이벤트가 중복으로 발행될 수 있다. 이는 at-least-once-delivery를 보장하는 트랜잭션 아웃박스 패턴에서는 당연한 동작이며, 소비자(Consumer)에서 멱등성을 위한 처리를 해야하는 이유이기도 하다. 필자는 도메인 이벤트 발행 서비스에서도 두가지 경로의 경합을 방지하기 위하여 미발행 이벤트 조회 시 `createAt`을 기준으로 30초가 지난 이벤트만을 조회하였다.

&nbsp; 이번 구현은 트랜잭션 아웃박스 패턴의 MessageRelay 개념을 참고하였다. 처음 보기에는 단순한 개념이라고 생각하였으나 실제 구현을 하면서 다양한 고민이 존재하였다. 이벤트의 특성과 팀에서 정의한 이벤트 상태에 따라 다르게 처리하기도 하며, 이벤트 폴링 방식도 Transaction Log Tailing, CDC 등 다양했다. 결국 구현에 앞서 도메인의 특성과 인프라 상황을 이해하는 것부터 우선이라는 생각이 들었다.

&nbsp; 도메인 이벤트 재발행 구조를 적응하며 팀원과 다양한 관점에 대한 시각을 공유하고, 현재 서비스 도메인에 대한 이해와 인프라 환경의 제약 등을 고민할 수 있었다. 