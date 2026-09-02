---
layout: posts
title: "도메인 이벤트 재발행 구조 도입기 2 - 메시지 브로커 및 이벤트 외부 발행 구조 도입"
author_profile: true
sidbar:
  nav: "main"
category: "web"
description: "여행 기록 관리 플랫폼 '여기가' 프로젝트를 진행하며, 비밀번호 초기화 이메일 전송 기능 개발을 담당하게 되었다. 기능 구현 후 이메일 전송 보장 기능을 도입해야하는 추가적 이슈가 발생하였다. 여러 방법들을 모색하던 중 '트랙잭션 아웃박스 패턴'에 대해 알게되었다. 이번 포스팅에서는 트랜잭션 아웃박스 패턴 구현 중 메시지 브로커 및 도메인 이벤트를 외부로 발행하는 구조를 도입하는 과정을 서술하고자 한다."
published: true
show_date: true
---

# 서론

&nbsp; [이전 포스팅(Transactional Outbox Pattern 도입기 2 - Event Outbox의 저장)](/web/tx-outbox-2/)에서 비밀번호 초기화/인증번호 이메일 전송 보장을 위한 트랜잭션 아웃박스 패턴 도입 과정 중 도메인 이벤트 발생 후, 이를 아웃박스의 형태로 바꾸어 데이터베이스에 저장하는 과정에 대해 알아보았다.

&nbsp; 도메인 이벤트를 아웃박스로 바꾸어 저장하는 이유는 이후 폴링 작업을 통해 주기적으로 아웃박스를 조회하여 이벤트 발행을 보장하기 위함이다.

&nbsp; 필자는 이벤트 발행을 2단계로 나누어서 처리하였다.

1. 트랜잭션 커밋 이후 즉시 발행 (빠른 이벤트 발행 및 적절한 폴링 주기 사용 목적)
2. 이벤트 아웃박스 폴링을 통한 재발행 (발행 보장)

&nbsp; Chris Richardson의 [Microservice Architecture - Pattern: Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html)에 따르면, 저장소에 저장된 아웃박스를 주기적인 폴링을 통해서 외부 메시지 브로커로 <u>발행</u>한다고 한다. 그러나 필자는 폴링 뿐만 아니라 Spring Event를 통한 트랜잭션 커밋 이후 시점에서 즉시 이벤트를 발행하는 로직을 추가하였다. 이는 이벤트의 빠른 발행과 이벤트를 즉시 발행함으로써 폴링 주기를 늘려 서버 부하를 해결하고자하는 것에 목적이 있다. 

&nbsp; 이번 포스팅에서는 <u>이벤트 생성 즉시(트랜잭션 커밋 완료 시점) 이벤트를 발행</u>하는 과정을 도입하게 되며 겪은 경험에 대해 작성해보고자 한다.

# 기존 이메일 발송 로직

&nbsp; 기존 비밀번호 초기화 요청 및 이메일 인증 기능은 Spring Event를 활용하여 핵심 비즈니스 로직과 이메일 발송 로직을 분리한 구조로 구현되어 있다.

&nbsp; 다만, 이는 동일한 애플리케이션 내부에서 동작하는 이벤트 기반 구조로 논리적 분리만 이루어졌을 뿐 물리적인 분리까지 확장되기는 어려운 상태이다.

&nbsp; 기존 이메일 발송 로직은 다음과 같은 흐름으로 구성되어 있다.

- 핵심 비즈니스 로직 수행 후 Spring Event를 통한 도메인 이벤트 내부 발행
- 이메일 발송용 리스너에서 도메인 이벤트 수신 후 이메일을 발송
- 이메일 발송 시 발생하는 Network I/O 지연을 고려하여 ThreadPoolTaskExecutor 기반 비동기 처리

&nbsp; 위와 같은 구성을 통해 핵심 로직과 부가 로직을 분리하고, 이메일 발송을 비동기적으로 처리하도록 구현하였다.

## 1) 핵심 비즈니스 로직 수행 후 Spring Event를 통한 도메인 이벤트 발행

&nbsp; 해당 예시는 비밀번호 초기화 요청 로직이다. 

```java
@Service
@RequiredArgsConstructor
public class PasswordManagementService {
    private final UserService userService;
    private final PasswordCodeService passwordCodeService;
    private final PasswordEncoder passwordEncoder;
    private final DomainEventPublisher eventPublisher;
    
    /**
     * 비밀번호 초기화 요청 메서드
     *
     * <p> 사용자 확인을 위한 확인용 코드 생성 및 저장
     *
     * <p> 해당 사용자에게 비밀번호 초기화 링크 메일 전송
     *
     * <p> 최종적으로 비밀번호 초기화 요청 이벤트 발행
     *
     * @param email     사용자 이메일
     * @param username  사용자 아이디
     * @throws CustomException AuthErrorType.MISMATCHED_EMAIL_OR_USERNAME - 이메일 또는 아이디가 불일치하는 경우
     */
    @Transactional
    public void requestPasswordReset(String email, String username) {
        if (!userService.existsIncludeDeletedByEmailAndUsername(email, username)) {
            throw new CustomException(AuthErrorType.MISMATCHED_EMAIL_OR_USERNAME);
        }

        if (passwordCodeService.existsCode(email)) {
            throw new CustomException(AuthErrorType.PASSWORD_RESET_TIME_LIMIT);
        }
        
        String code = PasswordCodeGenerator.generate();
        passwordCodeService.save(email, code);
        
        // 비밀번호 초기화 요청 도메인 이벤트 내부 발행
        eventPublisher.publish(new PasswordResetEvent(email, code));
    }
}
```

&nbsp; 비밀번호 초기화 요청 유즈케이스를 수행하는 `PasswordManagementService.requestPasswordReset(...)`에서는 사용자의 이메일과 비밀번호 초기화용 인증 코드를 생성 및 저장한 뒤, 해당 정보를 담은 `PasswordResetEvent`를 발행한다.

&nbsp; 이때 이벤트 발행은 `DomainEventPublisher`를 통해 수행되며, 내부적으로는 Spring의 `ApplicationEventPublisher`를 사용하여 애플리케이션 내부 이벤트로 전달된다.

&nbsp; 이후 발행된 이벤트는 `@TransactionalEventListener`를 통해 이벤트를 구독하는 리스너에서 수신하게 된다.

&nbsp; 비밀번호 초기화 요청 이벤트의 경우, '비밀번호 초기화 이메일 발송용 리스너'에서 이벤트를 수신한 뒤 `PasswordResetEvent`에 포함된 정보를 기반으로 이메일 발송을 수행한다.

## 2) 이메일 발송용 리스너에서 도메인 이벤트 수신 후 이메일을 발송

```java
@Component
@RequiredArgsConstructor
public class PasswordResetEventEmailListener extends DomainEventListener<PasswordResetEvent> {
    private final PasswordResetEmailSender passwordResetEmailSender;
    
    @Override
    @Async(value = EMAIL_TASK_EXECUTOR)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleEvent(PasswordResetEvent event) {
        passwordResetEmailSender.send(event.getEmail(), event.getCode());
        // TODO: Transactional Outbox Pattern 적용 시, 이벤트 상태 변경 로직 추가 필요
    }
}
```

&nbsp; `PasswordResetEventEmailListener`는 비밀번호 초기화 시 사용자 인증에 사용되는 확인 코드를 이메일로 발송하는 리스너이다.

&nbsp; 해당 리스너는 `PasswordResetEvent`를 수신한 뒤, 이벤트에 포함된 정보를 기반으로 `PasswordResetEmailSender.send(...)`를 호출하여 이메일을 발송하는 단순한 구조로 구성이 되어있다.

&nbsp; 이때, 이메일 발송은 핵심 비즈니스 로직에 대한 부가 로직이다. 

> 해석에 따라 핵심 비즈니스 로직에 포함할 수 있긴 하지만, 이메일 발송은 핵심 비즈니스 로직에 직접적인 영향을 주지 않는 부가 로직으로 보았다.   
> 또한, 이메일 발송은 외부 SMTP 서버와의 통신이 필요한 Network I/O 작업으로, 상대적으로 긴 지연 시간이 발생하기 때문에 핵심 비즈니스 로직과 분리하여 처리하였다.

&nbsp; 또한, <u>트랜잭션이 롤백될 경우 이메일이 발송되면 안 되기 때문</u>에 트랜잭션 커밋 이후 시점인 `TransactionPhase.AFTER_COMMIT` 시점에 이벤트를 처리하도록 구성하였다.

&nbsp; 그러나, 이러한 구조는 다음과 같은 한계를 가진다.

- 이벤트 발송 실패 시 자동 재시도 로직이 존재하지 않는다.
- 이벤트 처리 결과를 별도로 저장하지 않기 때문에 상태 추적 또는 재시도가 어렵다.
- 이미 처리된 이벤트는 재사용할 수 없기 때문에 재처리가 사실상 불가능하다.

&nbsp; 즉, 이벤트 처리 실패 시 이메일 발송이 유실될 수 있으며, 이를 보완하기 위해 트랜잭션 아웃박스 패턴을 도입한 것이기도 하다.

## 3) 이메일 발송 I/O를 고려한 ThreadPoolTaskExecutor 설정

&nbsp; 이메일 발송은 SMTP(Simple Mail Transfer Protocol)을 사용하여 외부 메일 서버와 네트워크 통신을 수행하는 I/O 작업이다. 이 과정에서 TCP 연결 수립, SMTP 핸드셰이크, 수신 서버 MX 레코드 조회(DNS), 메일 서버 내부 처리 과정(큐잉, 스팸 필터링)이 포함되기 때문에 서버 내부에서 행해지는 비즈니스 로직 수행에 비해 많은 지연 시간이 소요된다.

&nbsp; 이러한 특성을 고려하여, 이메일 발송은 Spring Event 기반으로 트랜잭션 커밋 이후 시점으로 분리하고, `@Async`를 활용해 비동기적으로 처리하도록 구성하였다.

&nbsp; 그러나, `@Async`만 사용할 경우, 기본 Executor 설정에 따라 스레드 생성이 과도하게 증가하거나 공용 쓰레드풀을 사용할 경우 다른 비동기 작업과 자원을 경쟁하게되어 시스템 부하가 급증할 수 있다.

&nbsp; 따라서, 이메일 발송 작업의 Network I/O 특성을 고려하여 별도의 `ThreadPoolTaskExecutor`를 도입하였다.

&nbsp;  Brian Goetz'의 저서 **<span style="font-family: 'Roboto Slab'">Java Concurrency in Practice - 8.2 Sizing Thread Pools</span>**에 따르면, I/O 또는 기타 블로킹 작업이 포함된 작업이라면 모든 쓰레드가 항상 스케줄링 가능한 상태로 존재하는 것은 아니기 때문에 <u>작업의 대기시간과 계산 시간의 비율을 측정하여 쓰레드풀 크기를 정해야한다</u>고 명시되어있다. 

&nbsp; 즉, 쓰레드는 I/O 작업을 기다리는 동안 CPU는 유휴(idle) 상태가 되므로, 더 많은 쓰레드를 생성하여 전체 처리량을 높이는 것이 효율적이다.

<div style="text-align: center;">
    <img src="/assets/img/docs/web/tx-outbox-3/thread-pool-size.png" alt="thread-pool-size">
</div>

- **N_cpu**: CPU의 수
- **U_cpu**: 대상 작업의 목표 CPU 사용률
- **W/C**: 대기 시간 / 연산 시간

&nbsp; 따라서, 위 공식을 참고해 적정 쓰레드풀 크기를 산정하였다.

&nbsp; 이메일 발송은 I/O Bound 위주 작업이므로 CPU 사용 비중이 낮다. 따라서, CPU를 최대한 활용하여 처리량을 높이기 위해 목표 CPU 사용률(<span style="font-family: 'Roboto Slab'">U_cpu</span>)은 `1`로 설정하였다.

&nbsp; 따라서, `적정_쓰레드_수 = CPU_코어_수 * (1 + wait_time / compute_time)`이다.

<div style="display: flex; justify-content: center;">
    <table style="border: 0.5px solid #d1d1d1; border-radius: 5px; min-width: 40%" >
        <thead style="text-align: center;">
            <tr style="border: 0.5px solid #d1d1d1; background-color: rgba(0, 0, 0, 0.02);">
                <td style="border: inherit">
                    Wait Time
                </td>
                <td style="border: inherit">
                    Compute Time
                </td>
            </tr>
        </thead>
        <tbody>
            <tr style="text-align: center; border: 0.5px solid #d1d1d1;">
                <td style="border: inherit;">약 2,400ms</td>
                <td style="border: inherit;">약 400ms</td>
            </tr>
        </tbody>
    </table>
</div>

&nbsp; 측정 결과 이메일 발송에 소요되는 Network I/O 등의 대기 시간은 평균 약 2,400ms, 연산 시간은 평균 약 400ms이다.

&nbsp; 따라서, `적정_쓰레드_수 = CPU_코어_수 * (1 + 2,400 / 400) = CPU_코어수 * 7`로 산정할 수 있으며, 이를 기반으로 `corePoolSize`를 설정하였다.

```java
@EnableAsync
@Configuration
public class AsyncConfig {
    public final static String EMAIL_TASK_EXECUTOR = "emailTaskExecutor";
    
    /**
     * 이메일 발송 작업 수행을 위한 ThreadPoolTaskExecutor 빈
     *
     * <p> 이메일 발송 로직 성능 측정 데이터 기반 corePoolSize 할당
     * <p> 산정 공식: cores * (1 + wait_time / service_time)
     *
     * <p> 예기치 못한 프로세스 종료 시에도, 대기 작업 수행을 위한 graceful shutdown 적용
     *
     * @return 비동기 이메일 발송 작업 용 ThreadPoolTaskExecutor
     */
    @Bean(name = EMAIL_TASK_EXECUTOR)
    public Executor emailTaskExecutor() {
        int cores = Runtime.getRuntime().availableProcessors();
        int corePoolSize = cores * 7;
        int maxPoolSize = corePoolSize * 2;
        
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(corePoolSize);
        executor.setMaxPoolSize(maxPoolSize);
        executor.setQueueCapacity(100);
        
        executor.setThreadNamePrefix("email-exec-");
        
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(60);
        executor.initialize();
        
        return executor;
    }
}
```

&nbsp; 따라서, 이메일 발송용 비동기 작업 수행을 위한 `ThreadPoolTaskExecutor` 설정 시 평균 쓰레드 풀 사이즈는 `호스트_CPU_수 * 7`로 산정하였다. 또한, 이메일 발송 요청 트래픽 급증 상황을 대비하여 `maxPoolSize`는 `corePoolSize * 2`로 설정하였다.

&nbsp; 또한, `queueCapacity`를 설정하여 일시적인 요청 증가 시 작업을 큐에 적재하며, 쓰레드 수를 무제한으로 증가시키는 상황을 방지하였다. 

&nbsp; 한편, 현재 구조에서는 재시도 매커니즘이 존재하지 않기 때문에 프로세스가 강제 종료될 경우 진행 중인 이메일 발송 작업이 유실될 가능성이 있다.

&nbsp; 이를 완화하기 위해 graceful shutdown 옵션을 적용하여 애플리케이션 종료 시 진행 중인 작업이 일정 60초 내에 마무리될 수 있도록 구성하였다.

```java
@Component
@RequiredArgsConstructor
public class PasswordResetEventEmailListener extends DomainEventListener<PasswordResetEvent> {
    private final PasswordResetEmailSender passwordResetEmailSender;
    
    @Override
    @Async(value = EMAIL_TASK_EXECUTOR)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleEvent(PasswordResetEvent event) {
        passwordResetEmailSender.send(event.getEmail(), event.getCode());
        // TODO: Transactional Outbox Pattern 적용 시, 이벤트 상태 변경 로직 추가 필요
    }
}
```

&nbsp; 빈으로 등록한 이메일 발송 전용 쓰레드 풀은 `@Async` 어노테이션의 `value`를 통해 지정 가능하다.

---

# 구조 개선

&nbsp; 앞서, 기존 구현에서는 이벤트를 외부로 발행하는 **발행자(Publisher)**와 발행된 이벤트를 처리하는 **소비자(Consumer)**가 동일한 애플리케이션에서 동작할 수 밖에 없는 구조였다.

&nbsp; 이로 인해 이메일 발송과 같이 Network I/O 시간이 오래 소요되는 부가 로직이 핵심 비즈니스 로직과 동일한 프로세스에서 처리되었고 이는 아래와 같은 문제점을 야기할 수 있었다.

- 이메일 발송을 위한 외부 시스템 장애 시 서비스 전체로 영향이 전파될 수 있다.
- 부가 로직의 확장 및 독립적인 배포가 불가능
- 이벤트 처리 실패 시 재처리나 실행 보장이 불확실

&nbsp; 따라서, 이러한 문제를 해결하기 위해 외부 메시지 브로커를 도입하여 이벤트 발행자(Publisher)와 소비자(Consumer)를 물리적으로도 분리 가능한 구조로 개선하였다. 이를 통하여 비동기 처리 및 장애 격리의 이점도 얻을 수 있다.

&nbsp; 특히, 메시지 브로커를 통해 재시도, Dead Letter Queue(DLQ), TTL 기반 지연 처리 등 이벤트 처리 보장 및 재시도를 위한 다양한 기능을 활용할 수 있었다.

![external-publish-arch](/assets/img/docs/web/tx-outbox-3/external-publish-arch.png)

&nbsp; 이번 포스팅에서는 트랜잭션 아웃박스 패턴 구현 과정 중 트랜잭션 커밋 이후 이벤트를 외부로 즉시 발행하는 구조를 중심으로 다룬다.

&nbsp; 트랜잭션 컴시 이후 즉시 발행된 이벤트는 메시지 브로커(RabbitMQ)로 전달되며, RabbitMQ에서 제공하는 **Publish Confirm** 기능을 통해 발행한 메시지(이벤트)의 도착 여부를 확인한다. 그 결과에 따라 이벤트 아웃박스의 상태를 갱신한다.


## 1. RabbitMQ 도입

&nbsp; 외부로 발행되는 이벤트는 메시지 브로커를 통해 전달된다.

&nbsp; 대표적인 메시지 브로커로는 Kafka, AWS SNS/SQS, RabbitMQ 등이 존재한다. 본 프로젝트에서는 비교적 설정이 간단하고, 팀원들이 익숙한 RabbitMQ를 외부 메시지 브로커로 선택하였다.

```gradle
// build.gradle

/* RabbitMQ */
implementation 'org.springframework.boot:spring-boot-starter-amqp'  
```

&nbsp; spring-boot-starter-amqp 디펜던시는 RabbitMQ 관련 클래스와 AutoConfiguration을 제공한다.

```yml
--- # rabbitMQ
spring:
  rabbitmq:
    host: ${RABBITMQ_HOST}
    port: ${RABBITMQ_PORT}
    username : ${RABBITMQ_USERNAME}
    password: ${RABBITMQ_PASSWORD}
    publisher-confirm-type: correlated
```

&nbsp; application.yml에서 RabbitMQ 관련 환경변수를 바인딩한다.

&nbsp; `host`, `port`, `username`, `password`는 RabbitMQ Server와 연결을 위한 기본 설정이다. 

&nbsp; `publisher-confirm-type`은 <u>Publish Confirm 기능을 활성화하기 위해 필요한 설정</u>으로, RabbitMQ 브로커가 메시지를 정상적으로 수신했는지 여부를 발행자(Publisher)에게 ACK/NACK 형태로 전달한다.

&nbsp; [RabbitMQ - Consumer Acknowledgements and Publisher Confirm](https://www.rabbitmq.com/docs/confirms#when-publishes-are-confirmed)에서 소비자(Consumer)에서 메시지 수신 여부를 브로커에 응답하는 <span style="font-weight: bold;">Consumer Acknowledgements</span>와 브로커에서 발행자(Publisher)에 메시지 수신 여부를 응답하는 <span style="font-weight: bold;">Publisher Confirm</span>에 대해 소개하고 있다. 

&nbsp; 트랜잭션 아웃박스 패턴에서 <u>Publisher의 책임은 이벤트(메시지)를 메시지 브로커까지 정상적으로 발행하는 것</u>이다. 따라서, RabbitMQ의 Publisher Confirm 기능을 활용하여 메시지의 정상 발행 여부를 확인해 이벤트 아웃박스의 상태를 갱신한다.

&nbsp; RabbitMQ의 Publisher Confirm 기능을 사용하기 위해서는 `spring.rabbitmq.publisher-confirm-type: correlated` 프로퍼티 설정이 필요하다. `publisher-confirm-type`으로는 3가지 값이 존재한다.

- `none`: Publisher Confirm 기능을 사용하지 않는다. (기본값)
- `simple`: 동기 방식으로, 메시지 발행 후 Confirm을 대기
- `correlated`: 비동기 방식으로, 메시지마다 correlation id를 부여해 Confirm을 처리

&nbsp; `simple` 방식은 동기 방식으로 처리하기 때문에 처리량이 낮다는 단점이 있다. 반면, `correlated` 방식은 비동기적으로 confirm을 처리할 수 있어 높은 처리량을 확보할 수 있다.

&nbsp; 본 구현에서는 이벤트 발행 성능을 고려하여 `correlated` 방식을 선택하였다.

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

&nbsp; 메시지를 발행을 위한 `RabbitTemplate`과 객체 ↔ JSON 변환을 위한 `Jackson2JsonMessageConverter`를 빈으로 등록한다.

&nbsp; 이벤트는 아웃박스 레코드의 `payload` 컬럼에 JSON 문자열 형태로 저장된다. 따라서, 향후 이벤트를 폴링하여 발행할 때 별도의 역직렬화 과정없이 즉시 메시지로 변환하여 전송할 수 있도록 `Jackson2JsonMessageConverter`를 사용하였다.

### RabbitMQ Exchange, Queue, Routing Key, TTL Property 설정

&nbsp; 외부 메시지 브로커로 발행하는 Publisher는 도메인 이벤트 종류에 따라 적절한 Exchange와 Routing Key를 통해 이벤트를 발행하는 역할을 수행한다.

&nbsp; 이를 위해 도메인 이벤트별로 사용할 Exchange, Queue, Routing Key, TTL 값을 프로퍼티로 분리하여 관리하도록 구성하였다.

```yml
rabbitmq:
  password-reset:
      queue: ${RABBITMQ_PASSWORD_RESET_QUEUE}
      exchange: ${RABBITMQ_PASSWORD_RESET_EXCHANGE}
      routing-key: ${RABBITMQ_PASSWORD_RESET_ROUTING_KEY}
      ttl: ${RABBITMQ_PASSWORD_RESET_TTL}
  email-verification:
      queue: ${RABBITMQ_EMAIL_VERIFICATION_QUEUE}
      exchange: ${RABBITMQ_EMAIL_VERIFICATION_EXCHANGE}
      routing-key: ${RABBITMQ_EMAIL_VERIFICATION_ROUTING_KEY}
      ttl: ${RABBITMQ_EMAIL_VERIFICATION_TTL}
```

```java
@Getter
@Setter
@Component
@ConfigurationProperties("rabbitmq")
public class RabbitMQProperties {
    private Attribute passwordReset;
    private Attribute emailVerification;

    @Getter
    @RequiredArgsConstructor
    public static class Attribute {
        private final String queue;
        private final String exchange;
        private final String routingKey;
        private final Long ttl;
    }
}
```

&nbsp; 각 도메인 이벤트별로 사용할 메시지 브로커 설정을 외부 프로퍼티로 분리함으로써, 환경에 따라 우연하게 설정할 수 있도록 하였다. 하드코딩된 값이 아닌 설정 기반으로 관리함으로써 이벤트 발행 정책을 명확하게 분리하였다.

&nbsp; 수동 지연 큐 전략에서는 하나의 이벤트에 대해 Work Queue / Retry Queue / Dead Letter Queue가 동시에 구성된다. 

&nbsp; 이때, 각 Queue는 접미사(postfix)를 통해 역할을 구분하며, 공통으로 사용되는 Exchange, Routing Key는 Queue 이름을 기반으로 파생되는 구조를 사용한다.

&nbsp; `ttl`은 Retry Queue에서 재시도 간격을 제어하기 위한 설정으로, 일정 시간 동안 소비되지 않는 메시지를 Dead Letter Exchange(DLX)로 이동하기 위한 TTL 값이다. 이는 향후 이벤트 소비 포스팅에서 자세히 다룰 예정이다. 

### RabbitMQ Exchange, Routing Key, Queue 바인딩

```java
@Configuration
public class PasswordResetRabbitMQConfig {
    private final RabbitMQProperties.Attribute properties;
    
    public PasswordResetRabbitMQConfig(RabbitMQProperties rabbitMQProperties) {
        this.properties = rabbitMQProperties.getPasswordReset();
    }
    
    @Bean
    public DirectExchange passwordResetExchange() {
        return new DirectExchange(properties.getExchange());
    }
    
    @Bean
    public Queue passwordResetEmailWorkQueue() {
        return QueueBuilder.durable(properties.getQueue() + ".email")
                .withArgument("x-dead-letter-exchange", properties.getExchange() + ".email.retry")
                .withArgument("x-dead-letter-routing-key", properties.getRoutingKey() + ".email.retry")
                .build();
    }
    
    @Bean
    public Binding PasswordResetEmailWorkBinding(Queue passwordResetEmailWorkQueue, DirectExchange passwordResetExchange) {
        return BindingBuilder.bind(passwordResetEmailWorkQueue)
                .to(passwordResetExchange)
                .with(properties.getRoutingKey() + ".email");
    }

    // Retry Queue, DeadLetter Queue 바인딩
}
```

&nbsp; 위 코드는 비밀번호 초기화 요청 이벤트 발행에 사용되는 Work Queue에 관한 설정이다. 

&nbsp; `DirectExchange`, `Queue`, `Binding`을 각각 빈으로 등록하여 애플리케이션 실행 시 RabbitMQ 자동으로 생성되도록 구성하였다. 물론 RabbitMQ Console을 통해서 수동으로 생성할 수도 있다.

&nbsp; 특히, Work Queue에는 DLX 설정을 추가하여 메시지 처리 실패 시 Retry Queue로 전달될 수 있도록 구성하였다. 

&nbsp; 각 요소 구성 시 이름에는 `이벤트.사용목적.{큐의_용도}`라는 컨벤션을 기반으로 생성하였다. 이는 `password-reset.email`과 같이 `PasswordResetEvent`를 `email` 발송을 위해 처리하는 큐를 네이밍을 통해서 추측할 수 있도록 한다. 또한, `password-reset.email.retry`와 같이 재시도(수동 지연) 목적의 큐를 나타내기도 한다.

&nbsp; 이를 통해 하나의 도메인 이벤트에 대해 처리해야할 부가 로직 용도에 맞게 Work Queue / Retry Queue / DeadLetter Queue를 일관된 네이밍 규칙으로 관리할 수 있었다.

&nbsp; 이와 같은 구조를 통해 메시지 처리 실패 시에도 Retry Queue를 통한 재시도 흐름을 구성할 수 있었으며, 이에 대한 자세한 소비 처리 로직은 향후 포스팅에서 다룰 예정이다.

### RabbitMQ Property Resolver

```java
@Component
@RequiredArgsConstructor
public class RabbitMQPropertyResolver {
    private final RabbitMQProperties properties;
    
    public String getPublishExchange(DomainEvent event) {
        if (event instanceof PasswordResetEvent) {
            return properties.getPasswordReset().getExchange();
        }
        
        if (event instanceof EmailVerificationEvent) {
            return properties.getEmailVerification().getExchange();
        }
        
        throw new IllegalArgumentException("Unsupported event: " + event.getClass().getSimpleName());
    }
    
    public String getPublishRoutingKey(DomainEvent event) {
        if (event instanceof PasswordResetEvent) {
            return properties.getPasswordReset().getRoutingKey() + ".requested";
        }
        
        if (event instanceof EmailVerificationEvent) {
            return properties.getEmailVerification().getRoutingKey() + ".requested";
        }
        
        throw new IllegalArgumentException("Unsupported event: " + event.getClass().getSimpleName());
    }
}
```

&nbsp; 외부 메시지 브로커로 발행되는 이벤트는 현재 비밀번호 초기화(PasswordReset)과 이메일 인증(EmailVerification) 두 가지로 구성되어있다.

&nbsp; 각 도메인 이벤트는 서로 다른 Exchange와 Routing Key를 통해 적절한 Queue로 라우팅되어야 한다.

&nbsp; 이를 위해 이벤트 타입에 따라 발행하는 Exchange와 Routing Key를 결정하는 `RabbitMQPropertyResolver`를 정의하였다.

&nbsp; 해당 클래스는 도메인 이벤트를 입력으로 받아, 각 이벤트에 대응하는 메시지 브로커 설정(Exchange, Routing Key)을 반환하는 역할을 수행한다.

&nbsp; 이를 통해 이벤트 발행 로직에서 라우팅 정책을 분리하고, 이벤트 발행 시점에서는 이벤트의 종류만 알면 구체적인 라우팅 전략은 Resolver에게 위임하여 결합도를 낮출 수 있었다.


## 2. 이메일 발송용 리스너 → 이벤트 발행용 리스너로 변경

&nbsp; 기존 로직에서는 트랜잭션 커밋 후(`AFTER_COMMIT`) 시점에서 이메일을 직접 발송하는 구조로 구성되어 있었다.

&nbsp; 그러나, 메시지 브로커를 도입하면서 도메인 이벤트의 발행자(Publisher)와 소비자(Consumer)를 분리하였고, 이에 따라 발행자는 <u>이벤트를 메시지 브로커까지 안전하게 전달하는 것</u>에 대한 책임을 가지게 되었다. 

&nbsp; 즉, 기존처럼 이메일을 직접 발송하는 것이 아니라, 트랜잭션 커밋 이후 시점에서 이벤트를 외부 메시지 브로커로 발행하는 구조로 변경하였다.

&nbsp; 이를 통해 이벤트 발행과 실제 처리(이메일 발송)의 책임을 분리하고, 이벤트 전달 보장을 위한 구조로 개선하였다. 

```java
public interface DomainEventExternalPublisher {
    CompletableFuture<EventPublishResult> publish(DomainEvent event);
}
```

&nbsp; 우선, 외부 이벤트 발행을 담당하는 `DomainEventExternalPublisher` 인터페이스를 정의하였다.

&nbsp; 특정 메시지 브로커(RabbitMQ)에 대한 의존성을 추상화하여, 향후 다른 메시지 브로커로 변경하더라도 영향 범위를 최소화하기 위함이다.

&nbsp; 또한, 메시지 브로커로부터 Publish Confirm을 비동기적으로 수신받기 때문에 `CompletableFuture<EventPublishResult>`를 반환하도록 설계하였다.

&nbsp; 이를 통해 이벤트 발행 결과에 따른 후처리(EventOutbox 상태 갱신)를 비동기적으로 처리할 수 있도록 하였다.

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

&nbsp; `EventPublishResult`는 이벤트 발행 결과를 표현하는 객체로, 이벤트 식별자, 발행 성공 여부, 실패 원인을 포함한다.

&nbsp; 해당 객체는 Publish Confirm 결과를 기반으로 생성되며, 이후 이벤트 아웃박스의 상태를 갱신하는 데 사용된다.

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
}
```

&nbsp; `RabbitMQEventPublisher`는 `DomainEventExternalPublisher`의 구현체로, RabbitMQ 메시지 브로커로 이벤트를 발행하는 역할을 수행한다.

&nbsp; `rabbitTemplate.convertAndSend(...)` 메서드를 통해 이벤트를 발행하고, `CorrelationData`를 함께 전달하여 Publish Confirm 결과를 비동기적으로 수신한다.

&nbsp; [`CorrelationData`](https://docs.spring.io/spring-amqp/api/org/springframework/amqp/rabbit/connection/CorrelationData.html)는 메시지 발행 시 고유 식별자인 Correlation Id(= `eventId`)를 함께 전달하여, 비동기적으로 수신되는 Publish Confirm 결과를 특정 메시지와 매핑하기 위한 객체이다.

&nbsp; RabbitMQ에 메시지가 브로커에 정상적으로 도착했을 경우 ACK, 실패하 경우 NACK 신호를 반환하며, `CorrelationData.getFuture()`를 통해 해당 결과를 `CompletableFuture` 형태로 수신할 수 있다.

&nbsp; 따라서, `CompletableFuture<CorrelationData.Confirm>`에 `.thenApply(...)`를 적용하여 Confirm 결과를 `EventPublishResult`로 변환하는 후처리 로직을 구성하였다.

&nbsp; `Confirm.isAck()`이 `true`인 경우 메시지가 브로커에 정상적으로 전달된 것이므로 `EventPublishResult.success(...)`를 반환하고, `false`인 경우 `EventPublishResult.fail(...)`을 반환하도록 설계하였다.

&nbsp; 또한, Publish Confirm 처리 과정에서 발생하는 예외는 `.exceptionally(...)`를 통해 처리하며, 메시지 발행 과정(`convertAndSend`)에서 발생하는 동기 예외는 try-catch 블록을 통해 별도로 처리하였다.

&nbsp; `RabbitTemplate.convertAndSend(...)`의 첫 번째, 두 번째 인자로 메시지를 발행할 Exchange와 Routing Key를 명시해야 한다.

&nbsp; 도메인 이벤트별로 서로 다른 Queue로 라우팅 하기 위해 각기 다른 Exchange와 Routing Key가 필요하며, `RabbitMQPropertyResolver`를 통해 이벤트에 맞는 설정 값을 조회하여 메시지를 발행하도록 구성하였다.

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
                        eventOutboxService.updateToDoneByEventId(result.eventId());
                    } else {
                        eventOutboxService.updateToFailedByEventId(result.eventId());
                    }
                }, messagePublishTaskExecutor);
    }
}
```

```java
@EnableAsync
@Configuration
public class AsyncConfig {
    public final static String MESSAGE_PUBLISH_TASK_EXECUTOR = "messagePublishTaskExecutor";
    
    /**
     * 이벤트 메시지 발행을 위한 ThreadPoolTaskExecutor 빈
     *
     * @return 비동기 이메일 발송 작업 용 ThreadPoolTaskExecutor
     */
    @Bean(name = MESSAGE_PUBLISH_TASK_EXECUTOR)
    public Executor messagePublishTaskExecutor() {
        int cores = Runtime.getRuntime().availableProcessors();
        int corePoolSize = cores * 2;
        int maxPoolSize = cores * 4;
        
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(corePoolSize);
        executor.setMaxPoolSize(maxPoolSize);
        executor.setQueueCapacity(100);
        
        executor.setThreadNamePrefix("message-publish-exec-");
        
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(60);
        executor.initialize();
        
        return executor;
    }
}
```

```java
@Service
@RequiredArgsConstructor
public class EventOutboxService {
    private final EventOutboxRepository eventOutboxRepository;
    
    // ...

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void updateToDoneByEventId(String eventId) {
        eventOutboxRepository.updateStatusPublishedByEventId(eventId);
    }
    
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void updateToFailedByEventId(String eventId) {
        eventOutboxRepository.updateStatusFailedByEventId(eventId);
    }
}
```

&nbsp; 이제 트랜잭션 커밋 완료(AFTER_COMMIT) 시점에서 `EventPublishResult` 결과에 따라 이벤트 아웃박스의 상태를 갱신해야 한다.

&nbsp; 이를 위해 `eventExternalPublisher.publish(event)`의 반환값인 `CompletableFuture<EventPublishResult>`를 처리하기 위해 `.thenAcceptAsync(Consumer, Executor)`를 적용하여 비동기적으로 후처리를 수행한다.

&nbsp; `EventPublishResult`가 성공 객체인 경우 이벤트 아웃박스의 상태는 성공(`PUBLISHED`), 실패 객체일 경우에는 실패(`FAILED`) 상태로 갱신한다.

&nbsp; 이때, 이벤트 발행 처리 성능을 고려하여 이벤트 메시지 발행 전용 `ThreadPoolTaskExecutor`를 새로 정의하였다. 이벤트 발행 자체에는 많은 시간이 소요되지 않기 때문에 `corePoolSize`는 사용 가능 코어 수의 2배로 설정하고, 트래픽이 집중적이로 몰릴 경우를 대비해 최대 4배로 늘어나도록 설정하였다.

### 이메일 발송 후, 트랜잭션 아웃박스 상태가 갱신되지 않던 이슈

&nbsp; 그러나, 이 과정에서 트랜잭션이 적용되지 않는 문제가 발생하였다.

&nbsp; `DomainEventPublishListener.handleEvent(DomainEvent)`는 `@Async`를 통해 별도의 쓰레드풀에서 동작하며, 이후 `.thenAcceptAsync(...)` 및 Publish Confirm 처리 과정에서도 추가적인 쓰레드 전환이 발생한다.

&nbsp; Spring의 트랜잭션은 ThreadLocal 기반으로 동작하기 떄문에 이와 같이 쓰레드가 변경될 경우 기존 트랜잭션 컨텍스트가 전파되지 않는다.

&nbsp; 즉, 동일한 메서드에 `@Transactional`을 추가하더라도 비동기 실행 구간에서는 트랜잭션이 적용되지 않는다.

&nbsp; 따라서, 이벤트 아웃박스 상태 갱신 로직은 별도의 트랜잭션에서 독립적으로 수행할 수 있도록 구성하였다.

&nbsp; `EventOutboxService` 도메인 서비스 클래스의 상태 갱신 메서드에 `@Transactional(propagation = Propagation.REQUIRES_NEW)`를 적용하여, 각 상태 변경 작업이 새로운 트랜잭션에서 실행되도록 하였다.

&nbsp; 이를 통해 비동기 처리 환경에서도 이벤트 아웃박스 상태를 안정적으로 갱신할 수 있도록 개선하였다.

---

# 결론

&nbsp; 이번 작업은 트랜잭션 아웃박스 패턴을 적용하여 Chris Richardson이 소개한 이벤트 폴링 작업 외에도 트랜잭션 커밋 이후(AFTER_COMMIT) 시점에 이벤트를 외부 메시지 브로커로 즉시 발행하는 구조를 추가로 도입하였다.

&nbsp; 이는 Spring Event가 제공하는 트랜잭션 시점 기반 이벤트 처리 장점을 활용하면서, 이벤트를 즉시 발행하여 폴링 대상 이벤트 수를 줄이고 전체 처리 효율을 개선하기 위한 설계이다.

&nbsp; 기존 구조에서는 Spring Event를 활용하여 핵심 비즈니스 로직과 부가 로직을 분리하였지만, 동일한 애플리케이션에서 동작할 수 밖에 없는 노리적인 분리이었기에 물리적 분리로 확장 가능성은 존재하지 않았다.

&nbsp; 따라서, 이메일 발송과 같이 Network I/O 기반의 부가 로직이 핵심 비즈니스 로직과 동일한 프로세스에서 처리되어 성능 부담과 장애 전파의 가능성을 내포하고 있었다.

&nbsp; 이번 구조 개선을 통해 이벤트 발행자(Publisher)와 소비자(Consumer)를 분리하고, Publisher는 이벤트를 메시지 브로커까지 안전하게 전달하는 역할에 집중하도록 구성하였다.

&nbsp; 현재 서비스는 모놀리식 구조이지만, 이번 설계를 통해 향후 부가 로직을 별도의 서비스로 분리하거나 확장하는 것이 용이한 구조를 갖추게 되었다.

&nbsp; 다음 포스팅에서는 트랜잭션 아웃박스 패턴의 핵심인 이벤트 폴링 기반 발행 보장 메커니즘에 대해 다룰 예정이다.