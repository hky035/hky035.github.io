---
layout: posts
title: "도메인 이벤트 재발행 구조 도입기 2 - 커밋 직후 발행과 RabbitMQ Publish Confirm"
author_profile: true
sidbar:
  nav: "main"
category: "web"
description: "&nbsp; 여행 기록 관리 플랫폼 '여기가' 프로젝트를 진행하며 이메일 인증·비밀번호 초기화 이메일 전송 기능 개발을 담당하게 되었다. 이메일 전송은 외부 메일 서버를 거쳐 실행되는 작업으로 Network I/O 등 시간이 오래 걸리는 작업이다. 따라서, 핵심 비즈니스 로직과 이메일 발송 로직을 분리하여 결합도를 낮추고, 향후 메일 서버 분리의 확장성을 염두에 두고 이메일 발송 로직을 이벤트 기반 아키텍처(EDA)로 분리하였다. EDA 도입 후 메시지 브로커로 이벤트가 발행되지 않아 이벤트가 유실되는 문제를 겪고 이에 대한 해결 방법을 모색하던 중 'Transactional Outbox Pattern'을 알게 되었다. 이번 포스팅에서는 각 도메인 이벤트를 일관된 EventOutbox로 변환하여 저장하는 과정을 구현한 경험을 공유하고자 한다."
published: true
show_date: true
---

# 서론

&nbsp; [이전 포스팅(도메인 이벤트 재발행 구조 도입기 1 - Event Outbox의 저장)](/web/tx-outbox-2/)에서 이메일 인증·비밀번호 초기화 기능에서 인증 번호를 저장하며 해당 이벤트를 `EventOutbox`로 변환하고 저장하는 과정에 대해 알아보았다.

&nbsp; 도메인 이벤트를 아웃박스로 바꾸어 저장(영속화)하는 이유는 <u>외부 메시지 브로커로 발행이 실패하더라도 언제든지 재발행을 수행</u>할 수 있게 하기 위함이다.

&nbsp; '여기가' 프로젝트에서는 이벤트 발행을 2단계로 나누어서 처리하였다.

1. 트랜잭션 커밋 이후 즉시 발행 (빠른 이벤트 발행 및 적절한 폴링 주기 사용 목적)
2. 이벤트 아웃박스 폴링을 통한 재발행 (발행 보장)

&nbsp; Chris Richardson의 [Microservice Architecture - Pattern: Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html)에 따르면, 저장소에 저장된 아웃박스를 주기적인 폴링을 통해서 외부 메시지 브로커로 발행한다. 그러나 필자는 폴링 뿐만 아니라 Spring Event를 통한 트랜잭션 커밋 이후 시점(`AFTER_COMMIT`)에서 즉시 이벤트를 발행하는 과정도 추가하였다. 이는 이벤트의 빠른 발행과 이벤트를 즉시 발행함으로써 폴링 주기를 늘려 서버 부하를 해결하고자하는 것이 목적이다.

&nbsp; 이번 포스팅에서는 <u>이벤트 생성 즉시(트랜잭션 커밋 완료 시점) 이벤트를 발행</u>하는 과정을 도입하게 되며 겪은 경험에 대해 작성해보고자 한다.

# 본론

# \# 트랜잭션 커밋 후 즉시 이벤트 발행

&nbsp; 트랜잭션 아웃박스 패턴은 MessageRelay를 통한 이벤트 발행을 기본으로 설명한다. 그러나, '여기가' 프로젝트에서는 트랜잭션 커밋 후(`AFTER_COMMIT`) 즉시 이벤트를 외부 메시지 브로커로 발행한다.

&nbsp; 이벤트는 아웃박스의 형태로 영속화되어있기에 즉시 발행하지 않더라도 MessageRelay(EventPoller)를 통해 언제든지 발행을 할 수 있고, 결국 즉시 발행하지 않더라도 발행이 될 것이다.

&nbsp; 그럼에도 트랜잭션 커밋 이후 즉시 이벤트를 발행하는 로직을 도입한 이유는, 만약 이벤트를 즉시 발행하는 로직이 없는 상태에서 도메인 이벤트가 다수 생성되는 상황을 고려했기 때문이다. 현재 '여기가'는 모놀리식 단일 모듈로 구성이 되어있기에 서버에서 생성되는 모든 도메인 이벤트가 동일한 RDB 저장소(MySQL)에 저장된다. 즉, 모든 이벤트가 동일한 EventOutbox 테이블에 저장되고, 또 발행되는 것이다. 

&nbsp; 현재는 도메인 이벤트가 2개 밖에 존재하지 않지만 향후 도메인 이벤트가 추가될 경우 즉시 발행 로직이 없다면 스케줄링을 통해 발행해야할 이벤트의 갯수가 급격히 많아질 가능성이 존재한다. 그렇다고 한 번에 조회되는 이벤트의 갯수를 줄이려 스케줄링 주기를 줄인다면 그것또한 쓰레드 및 기타 자원을 잦은 빈도로 사용하는 문제라고 생각하였다. 

&nbsp; 그러던 중 이벤트 아웃박스 저장에 공부하며 `@TransactionalEventLister`의 `phase` 옵션 중 `TransactionPhase.AFTER_COMMIT`이 존재하는 것을 알게되었다. `AFTER_COMMIT` 시점은 이미 핵심 비즈니스 로직의 수행과 이벤트 아웃박스 영속화가 진행된 이후 시점이기에 해당 시점에서 이벤트를 바로 발생한다면 스케줄링 주기를 너무 짧게 잡지 않아도 되고, 한 번에 조회되는 실패·미발행 이벤트의 수를 줄일 수 있다는 생각이 떠올랐다.

&nbsp; 또한, 이메일 인증·비밀번호 초기화 이벤트는 유효 시간이 존재하는 이벤트이다. 따라서, 빠른 이메일 발송이 필요한 부가 로직이라 생각하여 트랜잭션 커밋 이후 즉시 이벤트를 발행하기로 하였다.

# \# 발행의 책임

&nbsp; 이메일 인증, 비밀번호 초기화 기능에 EDA를 적용하여 도메인 이벤트를 발행함으로써 각 로직이 실행되는 서비스에서는 '발행의 책임'이 생긴다.

&nbsp; 여기서 '발행의 책임'은 단순히 "발행을 해야한다"가 아니다.

&nbsp; **"이벤트를 발행 후 해당 이벤트를 외부 메시지 브로커가 수신한지 여부를 확인하는 것"**이 발행의 책임이다.

&nbsp; 수신 여부 확인은 **Publish Confirm** 기능을 통해 구현할 수 있다. RabbitMQ에서는 [Consumer Acknowledgements and Publisher Confirm](https://www.rabbitmq.com/docs/confirms#when-publishes-are-confirmed)이라는 기술을 제공한다. 메시지가 소비자(Consumer)에 도착한지 여부, 메시지 브로커로 수신되었는지 여부를 확인할 수 있는 기술이다.

![rabbit-template-convert-and-send](/assets/img/docs/web/republish-domain-event-2/rabbit-template-convert-and-send.png)

&nbsp; Spring의 AMQP 디펜던시에서는 `RabbitTemplate` 클래스를 제공한다. RabbitMQ와의 통신을 수행하는 클래스이다.

&nbsp; 그 중 메시지 발행을 담당하는 `convertAndSend(...)` 메서드를 보면 4번째 인자로 `CorrelationData`를 전달하는 것을 알 수 있다. `CorrelationData`는 특정 메시지의 Publish Confirm 여부와 연관되는 객체이다.

&nbsp; `CorrelationData`는 `CompletableFuture<Confirm>`을 통해 비동기적으로 메시지 브로커의 메시지 수신 여부(Confirm)를 확인하고 향후 콜백 메서드를 지정할 수 있다.

```java
correlationData.getFuture().thenApply(confirm -> {
    if (confirm.isAck()) {
        // 메시지 브로커에 메시지가 성공적으로 수신되었을 때
    } else {
        // 메시지 브로커에 메시지가 수신되지 않았을 경우
    }
}).exceptionally(ex -> /*예외 처리*/);
```

# \# 트랜잭션 커밋 후 즉시 이벤트 발행 로직의 구현

&nbsp; 트랜잭션 커밋 이후 이벤트 아웃박스가 기록되고, `@TrnasactionalEventListener`를 통해서 도메인 이벤트 객체를 처리할 수 있다. 또한, 애플리케이션 단에서 ULID 타입의 `eventId`를 지정하여 이벤트 추적이 가능하다. 이 과정은 아래와 같이 요약 가능하다.

1. `AFTER_COMMIT` 시점에서 이벤트를 수신받아 처리
2. 외부 메시지 브로커(RabbitMQ)로 메시지를 발행
3. Publish Confirm을 통해 이벤트 아웃박스 상태를 갱신


## \## 1. `AFTER_COMMIT` 시점에서 이벤트를 수신받아 처리

### \### DomainEventPublishListener

```java
@Component
@RequiredArgsConstructor
public class DomainEventPublishListener implements DomainEventListener {
    private final DomainEventExternalPublisher eventExternalPublisher;
    private final EventOutboxService eventOutboxService;
    private final Executor messagePublishTaskExecutor;
    
    @Override
    @Async(value = MESSAGE_PUBLISH_TASK_EXECUTOR)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleEvent(DomainEvent event) {
        eventExternalPublisher.publish(event)
                .thenAcceptAsync(result -> {
                    if (result.isSuccess()) {
                        eventOutboxService.updateToPublishedByEventId(result.eventId());
                    } else {
                        eventOutboxService.updateToFailedByEventId(result.eventId());
                    }
                }, messagePublishTaskExecutor);
    }
}
```

&nbsp; `DomainEventPublishListener`는 `AFTER_COMMIT` 시점에 `DomainEvent`를 수신하여 외부 메시지 브로커로 메시지를 발행하고, 그 결과를 통해 이벤트 아웃박스의 상태를 갱신한다. 

&nbsp; 이벤트 외부 발행기 `DomainEventExternalPublisher`를 통해 메시지를 발행한다. 이후, Publisher가 반환하는 `EventPublishResult` DTO를 통해 Publish Confirm 결과를 수신하여 이벤트 아웃박스의 상태를 갱신한다.

```java
public record EventPublishResult(
        String eventId,
        boolean isSuccess,
        String cause
) {
    public static EventPublishResult success(String eventId) {
        return new EventPublishResult(eventId, true, null);
    }
    
    public static EventPublishResult fail(String eventId, String cause) {
        return new EventPublishResult(eventId, false, cause);
    }
}
```

&nbsp; `EventPublishResult`는 발행한 이벤트의 `eventId`, 발행 성공 여부, 실패 시 원인을 담아 반환한다.

## \## 2. 외부 메시지 브로커(RabbitMQ)로 메시지를 발행

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
    
    /**
     * RabbitMQ 메시지브로커로 이벤트를 발행하는 메서드
     *
     * <p> {@code CorrelationData}를 통해 메시지브로커로의 발행 여부를 확인
     *
     * <p> 메시지 발행 중 예외 발생 시 실패 상태 객체를 반환, 성공 시 성공 객체를 반환
     *
     * @param event 도메인 이벤트 객체
     * @return      실행 결과 {@link EventPublishResult}를 감싸고 있는 {@code CompletableFuture} 객체
     */
    @Override
    public CompletableFuture<EventPublishResult> publish(DomainEvent event) {
        CorrelationData correlationData = new CorrelationData(event.getEventId());
        
        CompletableFuture<EventPublishResult> result = correlationData.getFuture().thenApply(confirm -> {
            if (confirm.isAck()) {
                return EventPublishResult.success(event.getEventId());
            } else {
                return EventPublishResult.fail(event.getEventId(), confirm.getReason());
            }
        }).exceptionally(ex -> EventPublishResult.fail(event.getEventId(), ex.getMessage()));
        
        try {
            rabbitTemplate.convertAndSend(
                    rabbitMQPropertyResolver.getPublishExchange(event),
                    rabbitMQPropertyResolver.getPublishRoutingKey(event),
                    event,
                    correlationData
            );
        } catch (Exception e) {
            result.complete(EventPublishResult.fail(event.getEventId(), e.getMessage()));
        }
        
        return result;
    }

    // ...
}
```

&nbsp; `RabbitMQEventPublisher`는 `DomainEventExternalPublisher`의 구현체이다. 

&nbsp; `CorrleationData` 객체를 통해 비동기적으로 수신된 Publish Confirm의 결과를 통해 `EventPublishResult` DTO를 반환한다.

&nbsp; Publish Confirm은 `Confirm.isAck()` 메서드를 통해 외부 메시지 브로커의 메시지 수신 여부를 반환한다. ACK 신호가 도착한 경우 외에 모든 경우는 메시지 브로커로 메시지 수신 실패라고 판단한다.

## \## 3. Pulish Confirm을 통해 이벤트 아웃박스 상태를 갱신

&nbsp; `Confirm.isAck()` 여부에 따라서 `EventPublishResult.isSuccess` 필드의 값이 결정된다.

&nbsp; CompletableFuture를 통해 비동기적으로 메시지 수신 여부가 반환되면, 수신 여부에 따라 이벤트 상태를 갱신한다.

&nbsp; `.isSuccess()`가 true인 경우에만 이벤트 아웃박스의 상태를 `PUBLISHED`도 갱신한다.

&nbsp; 이때, `EventOutbox`의 PK는 IDENTITY 전략을 사용한 Long 타입의 키이다. 따라서, 도메인 이벤트 초기화 시 같이 생성한 `eventId`(ULID) 값을 통해 이벤트 아웃박스 상태를 갱신한다. 따라서, 반복적인 갱신 작업의 성능을 높이기 위해 `eventId` 컬럼을 보조 인덱스로 설정하였다.

### 이메일 발송 후, 트랜잭션 아웃박스 상태가 갱신되지 않던 이슈

&nbsp; 그러나, 이 과정에서 트랜잭션이 적용되지 않는 문제가 발생하였다.

&nbsp; `DomainEventPublishListener.handleEvent(DomainEvent)`는 `@Async`를 통해 별도의 쓰레드풀에서 동작하며, 이후 `.thenAcceptAsync(...)` 및 Publish Confirm 처리 과정에서도 추가적인 쓰레드 전환이 발생한다.

&nbsp; Spring의 트랜잭션은 ThreadLocal 기반으로 동작하기 때문에 이와 같이 쓰레드가 변경될 경우 기존 트랜잭션 컨텍스트가 전파되지 않는다. 즉, 동일한 메서드에 `@Transactional`을 추가하더라도 비동기 실행 구간에서는 트랜잭션이 적용되지 않는다.

&nbsp; 따라서, 이벤트 아웃박스 상태 갱신 로직은 별도의 트랜잭션에서 독립적으로 수행할 수 있도록 구성하였다.

&nbsp; `EventOutboxService` 도메인 서비스 클래스의 상태 갱신 메서드에 `@Transactional(propagation = Propagation.REQUIRES_NEW)`를 적용하여, 각 상태 변경 작업이 새로운 트랜잭션에서 실행되도록 하였다.

&nbsp; 이를 통해 비동기 처리 환경에서도 이벤트 아웃박스 상태를 안정적으로 갱신할 수 있게 되었다.

# 결론

&nbsp; 이번 포스팅은 이벤트 아웃박스 기록 후, 이벤트를 즉시 발행하는 로직을 구현한 과정을 담았다.

&nbsp; 도메인 이벤트의 생성 서비스에서는 해당 이벤트를 발행할 책임을 가진다. 이는 단순히 "이벤트를 발행한다"는 것이 아니라 "이벤트를 외부 메시지 브로커까지 전달"하는 것이다. 이를 위해 RabbitMQ의 Publish Confirm 기능을 통해 메시지 브로커로 메시지(이벤트) 수신 여부를 확인하여 이벤트 아웃박스의 상태를 갱신한다.

&nbsp; 트랜잭션 아웃박스 패턴에서는 기본적으로 MessageRelay를 통한 이벤트 발행 로직을 소개하지만, '여기가' 서비스에서 처리되는 이벤트는 유효 시간이 존재하는 이벤트이기에 빠른 부가 로직 처리를 위해 Spring Event의 `@TransactionalEventListener`를 통해 트랜잭션 커밋 이후 즉시 발행 로직을 도입하였다.

&nbsp; 트랜잭션 커밋 이후 즉시 발행이 실패하더라도, 이벤트 아웃박스는 이미 영속화되어있기 때문에 향후 재발행이 가능하다.

&nbsp; 메시지 브로커의 메시지 수신 여부(PublishConfirm)은 Java의 `CompletableFuture`를 통해 처리할 수 있다. 이번 기회를 통해 비동기에 대한 학습과 `CompletableFuture`를 배울 수 있었다. 또한, 유효 시간이 존재하는 도메인 이벤트의 특성을 고려하여 트랜잭션 커밋이후 이벤트를 즉시 발행하여 이벤트 처리 효율성을 높였다.

&nbsp; 다음 포스팅에서는 이벤트 아웃박스를 주기적으로 조회(폴링)하여 메시지 브로커로 발행하는 로직을 설명하고자 한다.