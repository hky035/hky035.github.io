---
layout: posts
title:  "한국투자증권 웹소켓 호출 유량 제한 정책 대응을 위한 다중 계좌 사용하기"
author_profile: true
sidbar:
  nav: "main"
category: "web"
description: "모의 주식 투자 서비스 '무주시'를 되돌아보며 이전부터 여러가지 문제가 발생했었던 한국투자증권 웹소켓 관련 부분을 리팩토링하기로 하였다. 기본적으로 한국투자증권에서는 세션 당 웹소켓 호출(구독 수) 유량 제한 정책으로 인하여 하나의 세션 당 41개의 종목에 대한 구독이 가능하다. 따라서, 다중 계좌를 사용하여 운용 가능 웹소켓 세션 수를 늘려 해당 정책에 대응하고자 한다. 또한, 이전부터 발생하였던 웹소켓 세션을 저장하기 위하여 해당 필드를 static 변수로 선언하여야지만 저장이 가능했던 이슈 등에 관한 내용을 다뤄보고자 한다."
published: true
show_date: true
---

# 서론

&nbsp; 최근 모의 주식 투자 서비스 '무주시(무자본 주식 시뮬레이션)'를 되돌아보며 과거의 부족함을 느끼고, 구조 및 기능적으로 개선할 부분을 리팩토링하고 있다. 해당 리팩토링의 가장 큰 목표는 **'한국투자증권 웹소켓 호출(구독 수) 유량 제한 정책 극복'**에 있다. 한국투자증권에서는 기본적으로 API나 웹소켓에 대하여 [호출 유량 제한 정책](https://apiportal.koreainvestment.com/community/10000000-0000-0011-0000-000000000001/post/d0d1a83f-6f8d-4437-9700-6d26702fd989)을 시행하고 있다. 웹소켓의 경우에는 하나의 세션 당 41개의 종목까지 구독이 가능하다. 또한, 하나의 세션은 하나의 개발자센터 계좌만 사용하기 때문에 실시간 체결가와 같은 정보를 제공하는데에는 어려움이 있다. 

&nbsp; 이전부터 해당 문제에 대한 개선을 시도하였지만, 웹소켓 세션 관리 방법에 대한 지식 부족과 웹소켓 관련 시스템 구조가 만족스럽지 않아 해당 PR을 병합해보지는 못하였다. 이번 기회를 통하여 웹소켓 세션 관리 방법을 중점적으로 하여 리팩토링을 심도있게 진행해보기로 하였다. 프로젝트를 같이하는 팀원이 있기에 해당 팀원의 계좌를 추가적으로 사용하여 2개의 계좌로 웹소켓 접속키를 발급하여 <u>2개의 웹소켓 세션을 운용하여 총 구독 가능 종목 수를 41 * 2 = 82 개로 늘려</u>보고자 한다.

&nbsp; 웹소켓 세션과 구독 가능 종목 수를 늘리는 문제 외에도 <u>기존 코드에서는 <span class="code">WebSocketSession</span>을 저장하기 위해서 static 변수로 선언해야지만 웹소켓 세션을 저장할 수 있었다</u>. 해당 동작에 의문을 느꼈지만 정확한 동작을 이해하지 못하였기에 단순히 <span style="font-style: italic;">"WebSocketSession은 static으로 선언하여야 직접 관리할 수 있구나"</span>라고 넘겨짚었었다. 이번 리팩토링을 통해 웹소켓 세션 연결부터의 과정과 사용되는 클래스와 메서드들을 자세히 살펴보며 해당 문제도 해결할 수 있게 되었다. 이 과정을 공유해보고자 한다.

## 클라이언트 - 서버 - 한국투자증권 웹소켓 흐름

![real-time-trade-ws-architecture](/assets/img/docs/web/refact-kis-websocket/real-time-trade-ws-arch.png)

&nbsp; 클라이언트는 한국 주식 시장이 열렸을 때 특정 종목 상세 페이지에 접속하게 된다면 해당 종목에 대한 실시간 체결가를 확인할 수 있게 된다. 따라서, 클라이언트 - 서버 - 한국투자증권은 웹소켓으로 연결되어 있다. 또한, 한국투자증권 실시간 체결가 웹소켓에 클라이언트가 현재 확인하고 있는 주식 종목에 대한 구독을 요청하게 된다.

1. **[클라이언트 → 서버]** 구독 요청

    한국 주식 시장이 열려있을 때, 클라이언트가 특정 종목의 상세 페이지에 접속하면 해당 종목에 대한 구독 요청을 위하여 서버로 웹소켓 연결을 시도한다.

2. **[서버]** 구독 종목 추가

    만약, 특정 종목을 구독하고 있는 사용자가 존재하지 않는데 특정 종목에 대한 실시간 체결가를 계속해서 수신받게 된다면 리소스 낭비로 이어질 것이다. 따라서, 서버에서는 클라이언트들이 구독하고 있는 종목의 구독 수를 관리해 현재 구독하고 있는 종목에 대해서만 구독 요청을 보내야한다. 

    따라서, 클라이언트의 특정 종목에 대한 구독 요청이 오면 서버에서는 해당 종목을 현재 관리 중인 구독 종목 목록에 추가해야한다.

3. **[서버 → 한국투자증권]** 국내주식 실시간 체결가 특정 종목 구독 요청

    서버에서는 특정 주식 종목이 처음 구독된 경우 [한국투자증권 국내주식 실시간 체결가](https://apiportal.koreainvestment.com/apiservice-apiservice?/tryitout/H0STCNT0) 웹소켓을 통해 해당 종목 구독 요청을 보낸다.

4. **[한국투자증권 → 서버]** 국내주식 실시간 체결가 응답

    한국투자증권에서는 구독한 종목에 대한 실시간 체결가를 웹소켓 세션을 통해 송신한다.

5. **[서버 → 메시지브로커]** 실시간 체결가 발행

    특정 종목을 구독 중인 클라이언트들에게 해당 종목의 실시간 체결가를 안정적으로 전달하기 위해 메시지브로커를 사용한다. 따라서, 한국투자증권으로부터 수신받은 실시간 체결가를 메시지 브로커로 발행한다.

6. **[메시지브로커 → 서버]** 실시간 체결가 수신

    서버에서는 메시지브로커에서 발행된 메시지를 수신한다. 
    
    이 과정은 사실 메시지의 발행 모듈과 수신 모듈을 다른 모듈에 배치시켜야하지만 현재는 서버 비용 등의 문제로 인하여 동일한 모듈 내에 배치시켰다. 이것또한 차후 개선 사항이다.

7. **[서버 → 클라이언트]** 웹소켓 메시지 수신

    서버에서는 메시지브로커로부터 수신된 실시간 체결가 메시지를 받아 특정 주식 종목을 구독 중인 클라이언트에게 해당 종목의 실시간 체결가를 전달한다.

&nbsp; 클라이언트가 보고있는 특정 주식 종목에 대한 실시간 체결가를 관리하고, 안정적인 메시지 전달을 위해 위와 같은 프로세스를 구상하였다. 메시지브로커로의 메시지 발행 모듈과 수신 모듈이 같은 모듈 내에 있다는 점 등 구조적인 개선사항은 존재하지만 현재는 서버 비용 등의 문제로 인하여 위와 같은 구조로 설계하였다. 또한, 구독 중인 종목의 구독 해지 과정도 동일한 프로세스로 진행된다.

&nbsp; 위의 프로세스에서 가장 중요한 부분은 <u>구독 종목 관리와 한국투자증권과 연결된 세션 당 현재 구독 수를 관리</u>하는 것이다. 따라서, 아래와 같은 부분은 중점으로하여 코드를 구상하였다.

- 웹소켓 세션 : 웹소켓 접속키 = 1 : 1 로 대응되어 관리되어야 한다. 
- 특정 종목이 이미 구독되고 있을 경우에는 한국투자증권에 추가적인 구독 요청이 필요없다. 
- 특정 종목에 대한 구독 해제 후, 해당 종목에 대한 구독 수가 0이면 한국투자증권에 구독해제 요청을 보내야한다.
- 해당 종목을 구독하여 메시지를 수신받고 있는 웹소켓 세션을 알아야 이후 구독 해제 요청이 가능하다. 

## 기존 코드 및 구조의 문제점

### 1. WebSocketConnectionManager를 사용한 웹소켓 세션 연결 관리

```java
@Configuration
@EnableWebSocket
@RequiredArgsConstructor
public class KisWebSocketConfig implements WebSocketMessageBrokerConfigurer {
    private final KisProperties kisProperties;
    private final KisRealTimeTradeHandler kisRealTimeTradeHandler;

    @Bean
    public WebSocketConnectionManager webSocketConnectionManager() {
        WebSocketClient client = new StandardWebSocketClient();
        return new WebSocketConnectionManager(
                client,
                kisRealTimeTradeHandler,
                kisProperties.getWebSocketDomain()
        );
    }
}
```

```java
@Component
@DependsOn("kisWebSocketConfig")
@RequiredArgsConstructor
public class WebSocketConnectionScheduler {
    private final WebSocketConnectionManager connection;
    private final KisWebSocketHandler kisRealTimeTradeHandler;

    // ...

    @Scheduled(cron = "0 59 8 * * 1-5")
    public void runConnectWebSocketSessionJob() {
        connection.start();
    }

    @Scheduled(cron = "0 30 15 * * 1-5")
    public void runDisconnectWebSocketToKis() {
        if (connection.isConnected())
            connection.stop();
    }
    
    // ...
}
```

&nbsp; 기존 코드에서는 위와 같이 `WebSocketConnectionManager`를 빈으로 등록하여서 웹소켓 연결을 관리하였다. 

&nbsp; `WebSocketConnectionManager`를 사용하여 웹소켓 연결을 관리한 이유는 해당 작업을 할 때 여러 블로그들에서 WebSocketConnectionManager를 사용하여 웹소켓 세션을 연결하는 코드를 보았고, `TextWebSocketHandler.afterConnectionEstablished(WebSocketSession)` 메서드에서 웹소켓 세션을 인자로 받고 있기 때문에 필자는 <span style="font-style: italic">"<code>TextWebSocketHandler</code>를 통해서 웹소켓 세션을 받아와야하는구나!"</span>라는 생각을 했었기 때문이다.

&nbsp; 그러나, 이는 웹소켓 세션의 연결 과정을 잘 이해를 하지 못하였기 때문에 발생한 이슈이다.

&nbsp; `WebSocketConnectionManager`는 웹소켓 연결과 세션 관리를 별도로 할 필요없도록 관련 기능들을 추상화한 클래스이다. 

```java
public class WebSocketConnectionManager extends ConnectionManagerSupport {
    private final WebSocketClient client;
    private final WebSocketHandler webSocketHandler;
    @Nullable
    private WebSocketSession webSocketSession;

    // ...
}
```

&nbsp; `WebSocketConnectionManger`의 내부를 확인해보면 `WebSocketSession`을 멤버 변수로 가지고 있다는 것을 알 수 있다. 즉, 단순히 메서드를 호출하여 웹소켓 세션을 연결/종료할 수 있다는 장점은 있지만, 객체 내부에서 웹소켓 세션을 관리하여 클라이언트가 직접 관리하는 등의 작업을 하기에는 적합하지 않다.

&nbsp; 웹소켓 연결 요청을 진행하는 실질적인 클래스(인터페이스)는 `WebSocketClient`이다.

&nbsp; `WebSocketConnectionManager` 객체를 생성할 때도 인자로 `WebSocketClient`의 구현체를 넘겨주듯이 웹소켓 연결/종료를 직접적으로 수행하고 연결된 웹소켓 세션을 반환하는 클래스이다.

![WebSocketClient](/assets/img/docs/web/refact-kis-websocket/web-socket-client-interface.png)

&nbsp; <code>WebSocketClient</code>는 내부에 `.dohandshake()`와 `.execute()` 메서드를 가지고 있으며, 각 반환값은 `Future<WebSocketSession>`이다. 

&nbsp; 해당 메서드들이 실제로 웹소켓을 연결하고, 세션을 반환하는 기능을 담당하고 있다. 따라서, `WebSocketClient`를 통해 직접 웹소켓을 연결하여야지만 제대로 웹소켓 세션을 반환받아 관리할 수 있는 것이다.

&nbsp; 기존 코드에서는 `TextWebSocketHandler`에서 메서드의 인자로 넘겨오는 웹소켓 세션을 관리하였지만, 이것은 클래스의 책임에도 맞지 않는 구조이며 제대로된 관리 방법이라 할 수 없다.

&nbsp; 또한, 각 메서드의 반환값이 `Future<WebSocketSession>` 임을 알 수 있는데, 이는 아래의 [2. WebSocketSession을 static 멤버 변수로 선언해야지만 웹소켓 세션이 바인딩 가능하던 문제](#ws-issue-2)의 원인이기도 하다.

<h3 id="ws-issue-2">2. WebSocketSession을 static 멤버 변수로 선언해야지만 웹소켓 세션이 바인딩 가능하던 문제</h3>

```java
@Slf4j
public abstract class KisWebSocketHandler extends TextWebSocketHandler {
    protected static WebSocketSession session;
    protected final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * 웹 소켓 연결 지속을 위한 메서드
     *
     * - 연결 유지를 위한 PINGPONG 메시지 송신
     */
    public void keepConnection() {
        Map<String, String> header = new HashMap<>();
        header.put("tr_id", "PINGPONG");
        header.put("datetime", LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss")));
        Map<String, Object> input = new HashMap<>();
        input.put("header", header);
        try {
            session.sendMessage(new TextMessage(objectMapper.writeValueAsString(input)));
        } catch (IOException e) {
            log.error(e.getMessage());
        }
    }

    public abstract void connect(String stockCode);
    public abstract void disconnect(String stockCode);
}
```

```java
@Component
@Slf4j
@RequiredArgsConstructor
public class KisRealTimeTradeHandler extends KisWebSocketHandler {
    private final TradeNotificationPublisher tradeNotificationPublisher;
    private final ObjectMapper objectMapper;
    private final RedisService redisService;

    private static final String TR_ID = "H0STCNT0";
    private static final int MAX_CONNECTION = 41;
    private final ConcurrentHashMap<String, Integer> subscribedStocks = new ConcurrentHashMap<>(MAX_CONNECTION);

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        this.session = session;
    }

    // ...
}
```

&nbsp; 앞서 확인했듯이 위의 기존 코드는 `TextWebSocketHandler`의 구현체에서 웹소켓 세션을 직접 관리하였기에 클래스의 책임도 너무 크며, 좋지 못한 구조였다.

&nbsp; 그러나, 해당 상황에서 발생한 **'<code>WebSocketSession</code>을 <code>static</code> 변수로 선언하여지만 값이 바인딩되던 문제'**에 대해 알아보고자 한다.

&nbsp; 해당 문제의 원인은 위에서 확인하였던 `WebSocketClient.execute()`의 반환값이 `CompletableFuture<WebSocketSession>`이기 때문이다. 따라서, static 변수로 선언하여야지만 이후 비동기적으로 연결이 완료된 후 반환되는 세션을 받을 수 있었던 것이다.

&nbsp; 필자는 이번 리팩토링에서 `WebSocketClient.execute()`를 직접 사용하여 웹소켓 세션을 연결하고 관리할 것이기 때문에 `CompletableFuture<WebSocketSession>` 반환값에서 `WebSocketSession` 객체를 얻는 방법을 알아보았다.

```java
public class CompletableFuture<T> implements Future<T>, CompletionStage<T> {
    // ...
    /**
     * Returns the result value when complete, or throws an
     * (unchecked) exception if completed exceptionally. To better
     * conform with the use of common functional forms, if a
     * computation involved in the completion of this
     * CompletableFuture threw an exception, this method throws an
     * (unchecked) {@link CompletionException} with the underlying
     * exception as its cause.
     *
     * @return the result value
     * @throws CancellationException if the computation was cancelled
     * @throws CompletionException if this future completed
     * exceptionally or a completion computation threw an exception
     */
    @SuppressWarnings("unchecked")
    public T join() {
        Object r;
        if ((r = result) == null)
            r = waitingGet(false);
        return (T) reportJoin(r);
    }
    // ...
}
```

&nbsp; `CompletableFuture<T>` 클래스에서는 `get(long timeout, TimeUnit unit)` 메서드를 사용해 시간 내에 값을 받아오는 방법도 존재하고, `join()` 메서드를 통해 비동기 작업이 완료된 후 값을 받아오는 방법이 존재한다. 필자는 웹소켓 세션 연결이 필수적으로 되어야지만 실시간 체결가 제공이 가능하기 때문에 `.join()` 메서드를 사용하여 웹소켓 세션을 받아오기로 하였다.

# 본론

## 관련 PR
<i class="fas fa-link"></i> [Refact: 한국투자증권 웹소켓 연결 세션 증설 및 구독 관리 로직 리팩토링](https://github.com/Team-Digimon/muzusi-was/pull/122)

---

&nbsp; 서론에서 이야기하였던 구조를 바탕으로 아래와 같은 기능(책임)을 담당하는 클래스들을 정의하였다.

- <code>StompInterceptor</code>: 클라이언트에서 서버로 보낸 웹소켓 메시지를 처리하는 클래스
- <code>TradeNotificationPublisher</code>: Reids pub/sub 메시지 브로커 방식을 통해 메시지를 발행하는 클래스
- <code>KisRealTimeTradeWebSocketHandler</code>: 한국투자증권으로부터 웹소켓 세션을 통해 수신되는 메시지를 처리하는 클래스
- <code>KisWebSocketConnector</code>: 한국투자증권 웹소켓 세션 연결을 담당하는 클래스
- <code>KisWebSocketSessionManager</code>: 한국투자증권과 연결된 웹소켓 세션을 관리하는 클래스
- <code>KisSubscriptionManager</code>: 주식 구독 종목 및 종목 당 연결 세션 정보 관리 클래스
- <code>KisRealTimeTradeWebSocketClient</code>: 한국투자증권 국내주식 실시간 체결가 웹소켓 요청 클래스

&nbsp; 위 클래스들 중 `StompInterceptor`와 `TradeNotificationPublisher`는 기존에 존재하던 클래스로, 이번 작업들 통해 약간의 코드 변경이 존재하였다. 

&nbsp; 그 외는 이번 작업을 통해서 코드를 완전히 변경하거나, 새로 만든 클래스들이다. 

![subscribe-sequence-diagram](/assets/img/docs/web/refact-kis-websocket/subscribe_sequence_diagram.png)

&nbsp; 구독 로직의 전체적인 로직은 다음과 같다. 

&nbsp; 초기에 한국투자증권과 웹소켓 세션을 연결하는 `KisWebSocketConnector`는 해당 시퀀스 다이어그램에서 제외되었다. `KisWebSocketConnector`의 로직에 대해서는 아래에서 자세히 설명한다.

## 1. KisWebSocketConnector

```java
@Slf4j
@Component
public class KisWebSocketConnector {
    private final WebSocketClient webSocketClient = new StandardWebSocketClient();
    private final KisRealTimeTradeWebSocketHandler kisRealTimeTradeWebSocketHandler;
    private final String webSocketDomain;
    
    public KisWebSocketConnector(
            KisProperties kisProperties,
            KisRealTimeTradeWebSocketHandler kisRealTimeTradeWebSocketHandler
    ) {
        this.webSocketDomain = kisProperties.getWebSocketDomain();
        this.kisRealTimeTradeWebSocketHandler = kisRealTimeTradeWebSocketHandler;
    }
    
    /**
     * 한국투자증권 웹소켓 세션 연결 메서드
     *
     * @return  한국투자증권 웹소켓과 연결된 세션
     */
    public WebSocketSession connect() {
        try {
            WebSocketSession session = webSocketClient
                    .execute(kisRealTimeTradeWebSocketHandler, webSocketDomain).join();
            
            return session;
        } catch (Exception e) {
            log.error("[Error] Failed to connect to KIS WebSocket - {}", e.getMessage());
            return null;
        }
    }
}
```

&nbsp; <code>KisWebSocketConnector</code>는 한국투자증권 웹소켓 도메인을 통해 웹소켓 세션을 연결한 후, 해당 웹소켓 세션을 반환하는 클래스이다.

&nbsp; 앞서, 서론의 [2. WebSocketSession을 static 멤버 변수로 선언해야지만 웹소켓 세션이 바인딩 가능하던 문제](#ws-issue-2)에서 설명하였듯이, 웹소켓을 연결하고 반환된 세션을 직접 관리하기 위해 `WebSocketClient.execute()` 메서드를 사용하여 연결 후 반환된 세션을 직접 받아 반환한다.

&nbsp; 해당 웹소켓 세션 연결 메서드는 주식 시장 시작 시에 `KisWebSocketSessionManager`의 세션 초기화 시 호출된다. 반환된 세션은 `KisWebSocketSessionManager`에서 관리하게 된다. 

## 2. KisRealTimeTradeWebSocketHandler

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class KisRealTimeTradeWebSocketHandler extends TextWebSocketHandler {
    private final TradeNotificationPublisher tradeNotificationPublisher;
    
    /**
     * 웹소켓 세션 연결 후 실행 메서드
     *
     * @param session       한국투자증권 웹소켓과 연결된 세션
     * @throws Exception    웹소켓 세션 연결 시 발생 예외
     */
    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        log.info("KIS Websocket session connected: {}", session.getId());
        super.afterConnectionEstablished(session);
    }
    
    /**
     * 웹소켓 세션 종료 후 실행 메서드
     *
     * @param session       한국투자증권 웹소켓과 연결되었던 세션
     * @param status        웹소켓 세션 연결 종료 상태
     * @throws Exception    웹소켓 세션 연결 종료 시 발생 예외
     */
    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        log.info("KIS Websocket session closed: {}", session.getId());
        super.afterConnectionClosed(session, status);
    }
    
    /**
     * 한국투자증권 웹소켓 세션을 통해 전달받은 메시지를 처리하는 메서드
     *
     * <p> 구독 주식 종목 실시간 체결가 메시지 수신 시, 해당 종목 구독자에게 메시지 송신
     *
     * <p> 세션 연결 유지를 위한 핑퐁(PingPong) 메시지 수신 시, 수신받은 페이로드와 동일한 페이로드를 응답
     *
     * @param session       웹소켓 세션
     * @param message       수신 메시지
     * @throws Exception    메시지 수신 시 발생 예외
     */
    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String payload = message.getPayload();
        
        if (isPingPong(payload)) {
            session.sendMessage(new TextMessage(payload));
            return;
        }
        
        if (isMetaMessage(payload)) {
            if (isErrorMessage(payload)) {
                log.error("[Error] Error message from KIS websocket - {}", payload);
            } else {
                log.info("[KIS Websocket] - {}", payload);
            }
            return;
        }
        
        tradeNotificationPublisher.publishTradeNotification(parsePayloadToNotificationDto(payload));
    }
    
    /**
     * 페이로드의 핑퐁 메시지 여부를 확인하는 메서드
     *
     * @param payload   페이로드
     * @return          페이로드의 핑퐁 메시지 여부
     */
    private boolean isPingPong(String payload) {
        return payload.contains("PINGPONG");
    }
    
    /**
     * 페이로드의 메타 메시지 여부를 확인하는 메서드
     *
     * @param payload   페이로드
     * @return          페이로드의 메타 메시지 여부
     */
    private boolean isMetaMessage(String payload) {
        return payload != null && !payload.isBlank() && payload.startsWith("{");
    }
    
    /**
     * 페이로드의 에러 메시지 여부를 확인하는 메서드
     *
     * <p> 웹소켓 응답 메타 메시지의 반환 코드(rt_cd)가 0을 제외한 나머지 경우는 모두 에러 응답
     *
     * @param payload   페이로드
     * @return          페이로드의 에러 메시지 여부
     */
    private boolean isErrorMessage(String payload) {
        return !payload.contains("\"rt_cd\":\"0\"");
    }
    
    /**
     * 페이로드를 해당 주식 종목 구독자에게 전달하기 위한 객체({@link TradeNotificationDto})로 변환하는 메서드
     *
     * @param payload   페이로드
     * @return          {@link TradeNotificationDto} 객체 리스트
     */
    private List<TradeNotificationDto> parsePayloadToNotificationDto(String payload) {
        List<TradeNotificationDto> result = new ArrayList<>();
        String[] parts = payload.split("\\^");
        String[] metas = parts[0].split("\\|");
        int tradeCount = Integer.parseInt(metas[2]);
        String stockCode = metas[3];
        
        for (int idx = 0, i = 0; i < tradeCount; i++) {
            result.add(TradeNotificationDto.builder()
                    .stockCode(stockCode)
                    .time(convertTime(parts[idx + 1]))
                    .price(Long.valueOf(parts[idx + 2]))
                    .stockCount(Long.valueOf(parts[idx + 12]))
                    .volume(Long.valueOf(parts[idx + 13]))
                    .tradeType((parts[idx + 21].equals("1")) ? TradeType.BUY : TradeType.SELL)
                    .changeRate(Double.valueOf(parts[idx + 5]))
                    .build());
            idx += 46;
        }
        
        return result;
    }
    
    /**
     * 페이로드에서 전달된 시각을 양식에 맞게 변환하는 메서드
     *
     * @param time  페이로드에 전달된 시각
     * @return      양식에 맞게 변환된 시각
     */
    private String convertTime(String time) {
        return time.substring(0, 2) + ":" + time.substring(2, 4) + ":" + time.substring(4);
    }
}
```

&nbsp; <code>KisRealTimeTradeWebSocketHandler</code>는 웹소켓 세션을 통해 수신되는 한국투자증권 국내주식 실시간 체결가 메시지를 처리하는 클래스이다. 

&nbsp; `handleTextMessage(WebSocketSession session, TextMessage message)` 메서드를 통해 수신되는 메시지의 페이로드를 분석하여 후처리를 진행한다.

&nbsp; 수신되는 페이로드가 핑퐁 메시지인 경우 [한국투자증권 개발자센터 공지](https://apiportal.koreainvestment.com/community/10000000-0000-0011-0000-000000000002/post/07f312e5-0bf3-4bbe-8179-1ffd7246b392)에 따라, 동일한 페이로드를 응답한다. 또한, 에러 메시지의 경우네느 에러 메시지 로그를 출력하도록 한다.

&nbsp; 해당 메시지가 유효한 메시지(실시간 체결가)인 경우에는 해당 메시지를 DTO에 맞도록 파싱하여 `TradeNotificationPublisher`를 통해 메시지브로커로 해당 메시지를 발행한다.

## 3. TradeNotificationPublisher

```java
@Component
@RequiredArgsConstructor
public class TradeNotificationPublisher {
    private final RedisTemplate redisTemplate;
    
    /**
     * 한국투자증권 국내 주식 체결가 정보 목록을 Redis Pub/Sub 토픽으로 발행(Publish)하는 메서드
     *
     * @param tradeNotifications    주식 체결가 정보 목록
     */
    public void publishTradeNotification(List<TradeNotificationDto> tradeNotifications) {
        for (TradeNotificationDto tradeNotification : tradeNotifications) {
            this.publishTradeNotification(tradeNotification);
        }
    }
    
    /**
     * 한국투자증권 국내 주식 체결가 정보를 Redis Pub/Sub 토픽으로 발행(Publish)하는 메서드
     *
     * @param tradeNotification     주식 체결가 정보
     */
    private void publishTradeNotification(TradeNotificationDto tradeNotification) {
        redisTemplate.convertAndSend(ChannelConstant.TRADE.getValue(), tradeNotification);
    }
}
```

&nbsp; <code>TradeNotificationPublisher</code>는 Redis pub/sub 메시지 브로커를 사용한 주식 체결가 정보를 발행하는 역할을 담당하는 클래스이다.

## 4. KisWebSocketSessionManager

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class KisWebSocketSessionManager {
    private final Map<String, KisWebSocketSession> sessions = new HashMap<>();
    private final KisWebSocketConnector kisWebSocketConnector;
    private final KisAuthService kisAuthService;
    
    /**
     * 웹소켓 세션을 초기화하는 메서드
     *
     * <p> {@link KisWebSocketConnector}를 통하여 한국투자증권 웹소켓과 연결 후 반환된 세션을 저장
     *
     * @return 한국투자증권 웹소켓과 연결된 세션의 아이디 목록
     */
    public List<String> initializeSessions() {
        List<String> webSocketKeys = kisAuthService.getWebSocketKeys();
        
        for (String webSocketKey : webSocketKeys) {
            WebSocketSession webSocketSession = kisWebSocketConnector.connect();
            
            if (webSocketSession != null) {
                sessions.put(webSocketSession.getId(), new KisWebSocketSession(webSocketSession, webSocketKey));
            }
        }
        
        return sessions.keySet().stream().toList();
    }
    
    /**
     * 웹소켓 세션 종료 후, 삭제하는 메서드
     */
    public void closeSessions() {
        for (KisWebSocketSession kisWebSocketSession : sessions.values()) {
            try {
                kisWebSocketSession.getWebSocketSession().close();
            } catch (IOException e) {
                log.error("[Error] Failed to close Websocket session - {}", kisWebSocketSession.getWebSocketSession().getId());
            }
        }
        
        sessions.clear();
    }
    
    /**
     * 특정 한국투자증권 웹소켓 세션 정보 객체를 조회하는 메서드
     *
     * @param sessionId 조회할 웹소켓 세션 ID
     * @return          한국투자증권 웹소켓 세션 정보 객체
     */
    public KisWebSocketSession getKisWebSocketSession(String sessionId) {
        return sessions.get(sessionId);
    }
    
    /**
     * 한국투자증권과 연결된 웹소켓 세션과 해당 세션의 웹소켓 접속키를 저장하는 클래스
     */
    public static class KisWebSocketSession {
        private final WebSocketSession webSocketSession;
        private final String webSocketKey;
        
        public KisWebSocketSession(WebSocketSession webSocketSession, String webSocketKey) {
            this.webSocketSession = webSocketSession;
            this.webSocketKey = webSocketKey;
        }
        
        public WebSocketSession getWebSocketSession() {
            return this.webSocketSession;
        }
        
        public String getWebSocketKey() {
            return this.webSocketKey;
        }
    }
}
```

&nbsp; <code>KisWebSocketSessionManager</code>는 한국투자증권과 연결된 웹소켓 세션을 관리하는 클래스이다.

&nbsp; `.initializeSessions()` 메서드에서는 웹소켓 세션을 저장하는 초기화 메서드이다. `KisAuthService.getWebSocketKeys()`를 호출하여 현재 저장된 모든 한국투자증권 웹소켓 접속키만큼 웹소켓 세션을 연결해 저장한다. 멤버 변수인 `kisWebSocketConnector.connect()` 메서드를 호출하여 반환된 웹소켓 세션을 저장한다.

&nbsp; 따라서, 계좌(웹소켓 접속키)가 여러 개인 경우더라도 해당 웹소켓 접속키만큼의 웹소켓 세션이 연결 가능하다.

&nbsp; 한국투자증권 웹소켓 세션은 세션 당 하나의 계좌(웹소켓 접속키)만 사용이 가능하기 때문에, **웹소켓 접속키:웹소켓 세션 = 1 : 1**로 관리되어야한다. 따라서, 내부 클래스인 `KisWebSocketSession`은 웹소켓 세션과 웹소켓 접속키를 함께 저장한다.

## 5. KisSubscriptionManager

```java
@Component
@RequiredArgsConstructor
public class KisSubscriptionManager {
    private final KisWebSocketSessionManager kisWebSocketSessionManager;
    private final KisRealTimeTradeWebSocketClient kisRealTimeTradeWebSocketClient;
    
    /**
     * 웹 소켓 세션 ID를 Key로 사용하여, 세션 별 구독 종목 정보({@link StockSubscriptionContext})를 저장하는 Map
     */
    private final Map<String, StockSubscriptionContext> stockSubscriptionContextBySession = new LinkedHashMap<>();
    
    /**
     * 종목 코드(StockCode)를 Key로 사용하여, 특정 종목 코드의 구독을 담당하는 웹 소켓 세션 ID를 저장하는 Map
     *
     * <p>해당 주식 종목 코드를 구독하고 있는 웹소켓 세션 ID를 바로 알아내기 위한 역인덱싱 목적
     */
    private final Map<String, String> stockSessionIndex = new HashMap<>();
    
    private final ReentrantLock lock = new ReentrantLock();
    
    /**
     * 웹소켓 세션 ID 목록을 인자로 받아, 웹소켓 세션 ID 별 구독 목록 Map을 초기화하는 메서드
     *
     * @param sessionIds    초기화할 웹소켓 세션 ID 목록
     */
    public void initialize(List<String> sessionIds) {
        for (String sessionId : sessionIds) {
            stockSubscriptionContextBySession.put(sessionId, new StockSubscriptionContext());
        }
    }
    
    /**
     * 웹소켓 세션 ID 별 구독 목록 Map과 주식 종목 코드 별 할당된 웹소켓 세션 ID Map을 비우는 메서드
     */
    public void clearSubscriptions() {
        stockSubscriptionContextBySession.clear();
        stockSessionIndex.clear();
    }
    
    /**
     * 주식 종목을 구독하는 메서드
     *
     * <p> 주식 종목 구독 정보를 관리하고, 초기 구독 요청이 온 종목의 경우에는
     * {@link muzusi.infrastructure.kis.websocket.KisWebSocketSessionManager}에 요청을 위임하여 구독 요청
     *
     * @param stockCode 주식 종목 코드
     */
    public void subscribe(String stockCode) {
        lock.lock();
        
        try {
            String sessionId = stockSessionIndex.get(stockCode);
            
            if (sessionId == null) { // 해당 주식 종목을 처음 구독하는 경우, 한국투자증권 국내주식 실시간 체결가 구독 요청
                sessionId = getAvailableSessionId();
                
                KisWebSocketSessionManager.KisWebSocketSession kisWebSocketSession = kisWebSocketSessionManager.getKisWebSocketSession(sessionId);
                
                kisRealTimeTradeWebSocketClient.subscribe(
                        kisWebSocketSession.getWebSocketSession(),
                        kisWebSocketSession.getWebSocketKey(),
                        stockCode
                );
                stockSessionIndex.put(stockCode, sessionId);
            }
            
            StockSubscriptionContext context = stockSubscriptionContextBySession.get(sessionId);
            context.add(stockCode);
        } finally {
            lock.unlock();
        }
    }
    
    /**
     * 구독 가능한 웹소켓 세션의 아이디를 반환하는 메서드
     *
     * @return 사용 가능한 웹소켓 세션 ID
     * @throws CustomException StockErrorType.MAX_REQUEST_WEB_SOCKET - 더 이상 구독 가능한 세션이 없는 경우
     */
    private String getAvailableSessionId() {
        return stockSubscriptionContextBySession.entrySet().stream()
                .filter(entry -> entry.getValue().isAvailable())
                .map(entry -> entry.getKey())
                .findFirst()
                .orElseThrow(() -> new CustomException(StockErrorType.MAX_REQUEST_WEB_SOCKET));
    }
    
    /**
     * 구독 중인 주식 종목에 대한 구독을 해제하는 메서드
     *
     * <p> 주식 종목 구독 해제를 담당하고, 구독 해제 후 해당 종목에 대한 더 이상 구독이 없는 경우에는
     * {@link muzusi.infrastructure.kis.websocket.KisWebSocketSessionManager}에 요청을 위임하여 구독 해제 요청
     *
     * @param stockCode 주식 종목 코드
     */
    public void unsubscribe(String stockCode) {
        lock.lock();
        
        try {
            String sessionId = stockSessionIndex.get(stockCode);
            
            if (sessionId == null || sessionId.isBlank()) {
                throw new CustomException(StockErrorType.NOT_SUBSCRIBED_STOCK);
            }
            
            StockSubscriptionContext context = stockSubscriptionContextBySession.get(sessionId);
            int subscriptionCount = context.getSubscriptionCount(stockCode);
            
            if (subscriptionCount == 1) { // 구독 해제 이후 더 이상 구독 수가 없다면, 해당 구독 종목을 삭제
                KisWebSocketSessionManager.KisWebSocketSession kisWebSocketSession = kisWebSocketSessionManager.getKisWebSocketSession(sessionId);
                kisRealTimeTradeWebSocketClient.unsubscribe(
                        kisWebSocketSession.getWebSocketSession(),
                        kisWebSocketSession.getWebSocketKey(),
                        stockCode
                );
                
                stockSessionIndex.remove(stockCode);
            }
            
            context.remove(stockCode);
        } finally {
            lock.unlock();
        }
    }
    
    /**
     * 주식 종목 코드와 해당 주식 종목에 대한 구독 수를 저장하는 컨텍스트 클래스
     *
     * <p>한국투자증권 웹소켓 호출 유량 제한을 충족하는 만큼의 구독 수를 관리
     */
    public static class StockSubscriptionContext {
        private static final int MAX_SUBSCRIPTION = 41;
        private final Map<String, Integer> subscribedStocks = new HashMap<>(MAX_SUBSCRIPTION);
        
        /**
         * 특정 주식 종목 구독 메서드
         *
         * <p> 처음 구독한 경우, 해당 종목에 대한 구독 수는 1로 설정
         *
         * @param stockCode 구독할 주식 종목 코드
         * @throws CustomException StockErrorType.MAX_REQUEST_WEB_SOCKET - 해당 세션을 통해 더 이상 새로운 종목을 구독할 수가 없는 경우
         */
        public int add(String stockCode) {
            return subscribedStocks.compute(
                    stockCode,
                    (stock, subscriptionCount) -> {
                        if (subscriptionCount == null) {
                            if (!isAvailable()) {
                                throw new CustomException(StockErrorType.MAX_REQUEST_WEB_SOCKET);
                            }
                            return 1;
                        }
                        
                        return subscriptionCount + 1;
                    }
            );
        }
        
        /**
         * 특정 주식 종목 구독 해제 메서드
         *
         * @param stockCode 구독 해제할 주식 종목 코드
         * @return          구독 해제 후 해당 주식 종목 구독 수
         */
        public int remove(String stockCode) {
            Integer afterSubscriptionCount = subscribedStocks.compute(
                    stockCode,
                    (stock, subscriptionCount) -> {
                        if (subscriptionCount == null) {
                            return null;
                        }
                        
                        if (subscriptionCount == 1) {
                            return null;
                        }
                        
                        return subscriptionCount - 1;
                    }
            );
            
            return afterSubscriptionCount == null ? 0 : afterSubscriptionCount;
        }
        
        /**
         * 특정 주식 종목 구독 수 반환 메서드
         *
         * @param stockCode 주식 종목 코드
         * @return          해당 주식 종목 구독 수
         */
        public int getSubscriptionCount(String stockCode) {
            return subscribedStocks.get(stockCode);
        }
        
        /**
         * 현재 겍체가 더 이상 구독이 가능한지 여부를 반환하는 메서드
         *
         * @return 최대 구독 가능 수보다 작을 경우 true, 최대 구독 수보다 같거나 클 경우 false
         */
        public boolean isAvailable() {
            return this.subscribedStocks.size() < MAX_SUBSCRIPTION;
        }
    }
}
```

&nbsp; <code>KisSubscriptionManager</code>는 한국투자증권 실시간 체결가 웹소켓 구독 종목 관리를 위한 핵심 클래스이다. 

&nbsp; `ReentrantLock`을 통한 동시성 제어를 기반으로 동작하며, 주식 종목에 대한 구독/해제 로직을 담당하고 있다. 또한, 멤버 변수인 `KisWebSocketSessionManager`에서 관리하는 세션을 받아와, 또다른 멤버 변수인 `KisRealTimeTradeWebSocketClient`를 통해 해당 세션으로 구독/해제 요청을 보낸다.

&nbsp; 또한, 다음과 같은 Map 멤버 변수들을 가지고 있다.

```java
/**
 * 웹 소켓 세션 ID를 Key로 사용하여, 세션 별 구독 종목 정보({@link StockSubscriptionContext})를 저장하는 Map
 */
private final Map<String, StockSubscriptionContext> stockSubscriptionContextBySession = new LinkedHashMap<>();

/**
 * 종목 코드(StockCode)를 Key로 사용하여, 특정 종목 코드의 구독을 담당하는 웹 소켓 세션 ID를 저장하는 Map
 *
 * <p>해당 주식 종목 코드를 구독하고 있는 웹소켓 세션 ID를 바로 알아내기 위한 역인덱싱 목적
 */
private final Map<String, String> stockSessionIndex = new HashMap<>();
```

&nbsp; `stockSubscriptionContextSession`은 Key로 웹소켓 세션 ID, Value로 `StockSubscriptionContext`를 가지고 있다. 

&nbsp; `StockSubscriptionContext`는 구독 종목과 해당 구독 종목의 구독 수를 관리하는 클래스이다. `stockSubscriptionContextSession` Map으로 저장되기 때문에 즉, 세션 당 구독 종목을 관리하게 되는 것이다.

&nbsp; 앞서 설명하였듯이, 특정 주식 종목이 이미 구독 되고 있는 경우 해당 종목은 추가적인 구독 요청을 진행하지 않아도 된다. 따라서, Key로 주식 종목 코드, Value로 해당 종목이 구독되고 있는 웹소켓 세션 ID를 사용하는 <u>역인덱싱</u> 목적의 `stockSessionIndex` Map을 가지고 있다. 

```java
/**
 * 주식 종목을 구독하는 메서드
 *
 * <p> 주식 종목 구독 정보를 관리하고, 초기 구독 요청이 온 종목의 경우에는
 * {@link muzusi.infrastructure.kis.websocket.KisWebSocketSessionManager}에 요청을 위임하여 구독 요청
 *
 * @param stockCode 주식 종목 코드
 */
public void subscribe(String stockCode) {
    lock.lock();
    
    try {
        String sessionId = stockSessionIndex.get(stockCode);
        
        if (sessionId == null) { // 해당 주식 종목을 처음 구독하는 경우, 한국투자증권 국내주식 실시간 체결가 구독 요청
            sessionId = getAvailableSessionId();
            
            KisWebSocketSessionManager.KisWebSocketSession kisWebSocketSession = kisWebSocketSessionManager.getKisWebSocketSession(sessionId);
            
            kisRealTimeTradeWebSocketClient.subscribe(
                    kisWebSocketSession.getWebSocketSession(),
                    kisWebSocketSession.getWebSocketKey(),
                    stockCode
            );
            stockSessionIndex.put(stockCode, sessionId);
        }
        
        StockSubscriptionContext context = stockSubscriptionContextBySession.get(sessionId);
        context.add(stockCode);
    } finally {
        lock.unlock();
    }
}

/**
 * 구독 가능한 웹소켓 세션의 아이디를 반환하는 메서드
 *
 * @return 사용 가능한 웹소켓 세션 ID
 * @throws CustomException StockErrorType.MAX_REQUEST_WEB_SOCKET - 더 이상 구독 가능한 세션이 없는 경우
 */
private String getAvailableSessionId() {
    return stockSubscriptionContextBySession.entrySet().stream()
            .filter(entry -> entry.getValue().isAvailable())
            .map(entry -> entry.getKey())
            .findFirst()
            .orElseThrow(() -> new CustomException(StockErrorType.MAX_REQUEST_WEB_SOCKET));
}
```

&nbsp; 특정 주식 종목 구독과 해제 로직은 모두 `ReentrantLock`을 통해 동시성을 제어한다. 

&nbsp; 락 획득 후 우선, 역인덱스 `stockSessionIndex`를 통해 해당 종목이 이미 구독 중인 웹소켓 세션의 ID를 획득한다. 이 때, 웹소켓 세션 ID가 <code>null</code>인 경우에는 해당 주식 종목을 처음 구독하는 경우이기 때문에 한국투자증권 국내주식 실시간 체결가 웹소켓에 구독 요청을 보낸다. 

&nbsp; 구독이 가능한 웹소켓 세션 ID를 가져온 다음, 해당 세션 ID를 통해 `kisWebSocketSessionManager`으로부터 해당 세션을 획득한다. 이후, 해당 세션과 `kisRealTimeTradeWebSocketClient`를 통해 한국투자증권 실시간 체결가 구독 요청을 보낸다. 이후, 역인덱스 `stockSessionIndex`에 해당 주식 종목 코드와 해당 종목이 구독되어 메시지를 전달받고 있는 세션 ID를 저장한다.

&nbsp; 최종적으로, 최초 구독 요청 여부와 상관없이 `stockSubscriptionContextBySession` Map에서 해당 세션에 대한 특정 종목 구독 수를 증가시킨다. 

```java
// KisSubscriptionManager.StockSubscriptionContext
/**
 * 특정 주식 종목 구독 메서드
 *
 * <p> 처음 구독한 경우, 해당 종목에 대한 구독 수는 1로 설정
 *
 * @param stockCode 구독할 주식 종목 코드
 * @throws CustomException StockErrorType.MAX_REQUEST_WEB_SOCKET - 해당 세션을 통해 더 이상 새로운 종목을 구독할 수가 없는 경우
 */
public int add(String stockCode) {
    return subscribedStocks.compute(
            stockCode,
            (stock, subscriptionCount) -> {
                if (subscriptionCount == null) {
                    if (!isAvailable()) {
                        throw new CustomException(StockErrorType.MAX_REQUEST_WEB_SOCKET);
                    }
                    return 1;
                }
                
                return subscriptionCount + 1;
            }
    );
}

/**
 * 특정 주식 종목 구독 해제 메서드
 *
 * @param stockCode 구독 해제할 주식 종목 코드
 * @return          구독 해제 후 해당 주식 종목 구독 수
 */
public int remove(String stockCode) {
    Integer afterSubscriptionCount = subscribedStocks.compute(
            stockCode,
            (stock, subscriptionCount) -> {
                if (subscriptionCount == null) {
                    return null;
                }
                
                if (subscriptionCount == 1) {
                    return null;
                }
                
                return subscriptionCount - 1;
            }
    );
    
    return afterSubscriptionCount == null ? 0 : afterSubscriptionCount;
}
```

&nbsp; <code>KisSubscriptionManager</code>의 내부 클래스인 <code>StockSubscriptionContext</code>에서는 구독 종목 추가, 삭제 시 자체적인 처리 로직을 가진다. 따라서, 웹소켓 호출 유량 제한 내에서 유동적으로 구독 종목을 관리할 수 있게 된다.

&nbsp; 해당 절에서 따로 설명하지는 않았지만, 구독 해제 로직의 경우에도 거의 동일한 흐름으로 로직이 진행된다.

## 6. KisRealTimeTradleWebSocketClient

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class KisRealTimeTradeWebSocketClient {
    private final ObjectMapper objectMapper;
    private static final String TRADE_ID = "H0STCNT0";
    
    private enum TradeType {
        SUBSCRIPTION(1),
        UNSUBSCRIPTION(2);
        
        private final int value;
        
        TradeType(int value) {
            this.value = value;
        }
        
        public int getValue() {
            return this.value;
        }
    }
    
    /**
     * 한국투자증권 국내주식 실시간 체결가 웹소켓 구독 요청 메서드
     *
     * @param session       웹소켓 세션
     * @param webSocketKey  웹소켓 접속키
     * @param stockCode     주식 종목 코드
     */
    public void subscribe(WebSocketSession session, String webSocketKey, String stockCode) {
        this.request(session, webSocketKey, stockCode, TradeType.SUBSCRIPTION);
    }
    
    /**
     * 한국투자증권 국내주식 실시간 체결가 웹소켓 구독 해제 요청 메서드
     *
     * @param session       웹소켓 세션
     * @param webSocketKey  웹소켓 접속키
     * @param stockCode     주식 종목 코드
     */
    public void unsubscribe(WebSocketSession session, String webSocketKey, String stockCode) {
        this.request(session, webSocketKey, stockCode, TradeType.UNSUBSCRIPTION);
    }
    
    /**
     * 한국투자증권 국내주식 실시간 체결가 웹소켓 요청 메서드
     *
     * @param session       웹소켓 세션
     * @param webSocketKey  웹소켓 접속키
     * @param stockCode     주식 종목 코드
     * @param tradeType     거래 타입 (1: 구독, 2: 해제)
     */
    private void request(WebSocketSession session, String webSocketKey, String stockCode, TradeType tradeType) {
        if (session == null || !session.isOpen()) {
            log.error("[Error] Failed to send request KIS Websocket - Session is null or closed.");
            return;
        }
        
        Map<String, String> header = new HashMap<>();
        header.put("approval_key", webSocketKey);
        header.put("custtype", "P");
        header.put("tr_type", String.valueOf(tradeType.getValue()));
        header.put("content-type", "utf-8");
        
        Map<String, Object> body = new HashMap<>();
        Map<String, String> input = new HashMap<>();
        input.put("tr_id", TRADE_ID);
        input.put("tr_key", stockCode);
        body.put("input", input);
        
        Map<String, Object> request = new HashMap<>();
        request.put("header", header);
        request.put("body", body);
        
        try {
            session.sendMessage(new TextMessage(objectMapper.writeValueAsString(request)));
        } catch (Exception e) {
            log.error("[Error] Failed to send request KIS Websocket - {} / {}", stockCode, e.getMessage());
        }
    }
}
```

&nbsp; `KisRealTimeTradeWebSocketClient`는 한국투자증권 웹소켓 서버로 구독/해제 요청을 보내는 클래스이다. 실제 요청을 보내는 세부 로직은 `request()` 메서드를 두어 내부에서 처리한다. 외부에는 `subscribe()`, `unsubscribe()` 메서드만 노출하여 추상화된 인터페이스를 제공한다.

## 7.StompInterceptor

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class StompInterceptor implements ChannelInterceptor {
    private final KisSubscriptionManager kisSubscriptionManager;
    private final StockSearchService stockSearchService;

    private final static String STOCK_CODE_HEADER_NAME = "stockCode";

    /**
     * 특정 종목 구독 및 해제 시 한국투자증권 웹소켓 연결 관리를 위한 메서드
     *
     * - 구독 등록 시, 한국투자증권 주식 체결가 웹 소켓 등록 요청
     * - 구독 해제 시, 한국투자증권 주식 체결가 웹 소켓 해제 요청
     *
     * @param message : 수신 메시지
     * @param channel : 메시지 채널
     * @return        : 기본 처리 메서드 호출
     */
    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(message);
        String stockCode = extractStockCode(accessor);

        if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
            try {
                stockSearchService.increaseStockSearchCount(stockCode);
                kisSubscriptionManager.subscribe(stockCode);
            } catch (Exception e) {
                log.error("[ERROR] Failed to subscribe stock {} - {}", stockCode, e.getMessage());
                return null;
            }
            
        }
        
        if (StompCommand.UNSUBSCRIBE.equals(accessor.getCommand())) {
            try {
                kisSubscriptionManager.unsubscribe(stockCode);
            } catch (Exception e) {
                log.error("[ERROR] Failed to unsubscribe stock {} - {}", stockCode, e.getMessage());
                return null;
            }
        }

        return message;
    }
    
    /**
     * STOMP 요청 메시지 헤더 내 주식 종목 코드 추출 메서드
     *
     * @param accessor  STOMP 헤더 접근 객체
     * @return          주식 종목 코드
     */
    private String extractStockCode(StompHeaderAccessor accessor) {
        return accessor.getFirstNativeHeader(STOCK_CODE_HEADER_NAME);
    }
}
```

&nbsp; <code>StompInterceptor</code>는 클라이언트의 웹소켓 요청을 받아 처리하는 클래스이다.

&nbsp; 해당 요청의 커맨드를 분석하여 구독 요청일 경우, 헤더에 담긴 주식 종목 코드를 통해 구독 로직을 시행한다. 구독 해제의 경우에도 동일하다.

## 추가. KisWebSocketConnectioinScheduler

```java
@Component
@RequiredArgsConstructor
public class KisWebSocketConnectionScheduler {
    private final KisWebSocketSessionManager kisWebSocketSessionManager;
    private final KisSubscriptionManager kisSubscriptionManager;

    @PostConstruct
    public void init() {
        LocalDateTime now = LocalDateTime.now();
        DayOfWeek dayOfWeek = now.getDayOfWeek();
        int hour = now.getHour();
        int minute = now.getMinute();
        
        boolean isWeekend = (dayOfWeek == DayOfWeek.SATURDAY) || (dayOfWeek == DayOfWeek.SUNDAY);
        boolean isMarketOpened = (hour > 8 || (hour == 8 && minute >= 55))
                                    && (hour < 15 || (hour == 15 && minute < 30));
        
        if (!isWeekend && isMarketOpened) {
            List<String> connectedSessionIds = kisWebSocketSessionManager.initializeSessions();
            kisSubscriptionManager.initialize(connectedSessionIds);
        }
    }

    @Scheduled(cron = "0 59 8 * * 1-5")
    public void runConnectKisWebSocketSessionJob() {
        List<String> connectedSessionIds = kisWebSocketSessionManager.initializeSessions();
        kisSubscriptionManager.initialize(connectedSessionIds);
    }

    @Scheduled(cron = "0 30 15 * * 1-5")
    public void runDisconnectKisWebSocketJob() {
        kisWebSocketSessionManager.closeSessions();
        kisSubscriptionManager.clearSubscriptions();
    }
}
```

```java
// KisWebSocketSessionManager
/**
 * 웹소켓 세션을 초기화하는 메서드
 *
 * <p> {@link KisWebSocketConnector}를 통하여 한국투자증권 웹소켓과 연결 후 반환된 세션을 저장
 *
 * @return 한국투자증권 웹소켓과 연결된 세션의 아이디 목록
 */
public List<String> initializeSessions() {
    List<String> webSocketKeys = kisAuthService.getWebSocketKeys();
    
    for (String webSocketKey : webSocketKeys) {
        WebSocketSession webSocketSession = kisWebSocketConnector.connect();
        
        if (webSocketSession != null) {
            sessions.put(webSocketSession.getId(), new KisWebSocketSession(webSocketSession, webSocketKey));
        }
    }
    
    return sessions.keySet().stream().toList();
}
```

```java
// KisSubscriptionManager
/**
 * 웹소켓 세션 ID 목록을 인자로 받아, 웹소켓 세션 ID 별 구독 목록 Map을 초기화하는 메서드
 *
 * @param sessionIds    초기화할 웹소켓 세션 ID 목록
 */
public void initialize(List<String> sessionIds) {
    for (String sessionId : sessionIds) {
        stockSubscriptionContextBySession.put(sessionId, new StockSubscriptionContext());
    }
}
```

&nbsp; <code>KisWebSocketConnectionScheduler</code>는 한국투자증권과의 웹소켓 세션의 연결/종료를 스케줄링하는 클래스이다.

&nbsp; `KisWebSocketSessionManager.initializeSessions()`를 호출하여 한국투자증권과 웹소켓 세션을 연결하고, 연결된 웹소켓 세션의 ID를 반환한다. 또한, 해당 세션 ID를 통해 `KisSubscriptionManager.initialize(List<String>)`를 호출하여 해당 세션들의 '세션 당 구독 종목' 변수들을 초기화한다.

# 테스트

&nbsp; 테스트는 `KisSubscriptionManager`에 대한 단위 테스트와 구독/해제 로직에 대한 통합 테스트를 진행하였다. 통합 테스트는 k6를 통한 동시 사용자 수를 설정하여 실제 환경을 고려하여 테스트를 진행하였다.


## KisSubscriptionManagerTest

```java
@ExtendWith(MockitoExtension.class)
public class KisSubscriptionMangerTest {

    @Mock
    private KisWebSocketSessionManager kisWebSocketSessionManager;
    
    @Mock
    private KisRealTimeTradeWebSocketClient kisRealTimeTradeWebSocketClient;
    
    @InjectMocks
    private KisSubscriptionManager kisSubscriptionManager;
    
    @Nested
    @DisplayName("구독")
    class Subscribe {
        private final String sessionId1 = "sessionId1";
        private final String sessionId2 = "sessionId2";
        private final String webSocketKey1 = "webSocketKey1";
        private final String webSocketKey2 = "webSocketKey2";
        private KisWebSocketSessionManager.KisWebSocketSession kisWebSocketSession1;
        private KisWebSocketSessionManager.KisWebSocketSession kisWebSocketSession2;
        
        @Captor
        private ArgumentCaptor<WebSocketSession> sessionCaptor;
        
        @Captor
        private ArgumentCaptor<String> webSocketKeyCaptor;
        
        @Captor
        private ArgumentCaptor<String> stockCodeCaptor;
        
        @BeforeEach
        void setUp() {
            WebSocketSession session1 = mock(WebSocketSession.class);
            WebSocketSession session2 = mock(WebSocketSession.class);
            kisWebSocketSession1 = new KisWebSocketSessionManager.KisWebSocketSession(session1, webSocketKey1);
            kisWebSocketSession2 = new KisWebSocketSessionManager.KisWebSocketSession(session2, webSocketKey2);
            lenient().when(session1.getId()).thenReturn(sessionId1);
            lenient().when(session2.getId()).thenReturn(sessionId2);
            lenient().when(kisWebSocketSessionManager.getKisWebSocketSession(sessionId1)).thenReturn(kisWebSocketSession1);
            lenient().when(kisWebSocketSessionManager.getKisWebSocketSession(sessionId2)).thenReturn(kisWebSocketSession2);
            
            Map<String, KisSubscriptionManager.StockSubscriptionContext> mockStockSubContextBySession = new LinkedHashMap<>();
            KisSubscriptionManager.StockSubscriptionContext mockStockSubscriptionContext1 = new KisSubscriptionManager.StockSubscriptionContext();
            KisSubscriptionManager.StockSubscriptionContext mockStockSubscriptionContext2 = new KisSubscriptionManager.StockSubscriptionContext();
            mockStockSubContextBySession.put(sessionId1, mockStockSubscriptionContext1);
            mockStockSubContextBySession.put(sessionId2, mockStockSubscriptionContext2);
            
            ReflectionTestUtils.setField(kisSubscriptionManager, "stockSubscriptionContextBySession", mockStockSubContextBySession);
        }

        @SuppressWarnings("unchecked")
        private Map<String, String> getStockSessionIndex() {
            return (Map<String, String>) ReflectionTestUtils.getField(kisSubscriptionManager, "stockSessionIndex");
        }
        
        @SuppressWarnings("unchecked")
        private Map<String, KisSubscriptionManager.StockSubscriptionContext> getStockSubscriptionContextBySession() {
            return (Map<String, KisSubscriptionManager.StockSubscriptionContext>) ReflectionTestUtils.getField(
                    kisSubscriptionManager,
                    "stockSubscriptionContextBySession"
            );
        }
        
        @Test
        @DisplayName("주식 종목을 처음 구독을 하는 경우")
        void successIfFirstSubscription() {
            // given
            String stockCode = "000001";
            doNothing().when(kisRealTimeTradeWebSocketClient).subscribe(any(WebSocketSession.class), anyString(), anyString());
            
            // when
            kisSubscriptionManager.subscribe(stockCode);
            
            // then
            // 1. 처음 구독한 종목은 한국투자증권 실시간 체결가 웹소켓 구독 요청 메서드를 호출한다.
            verify(kisRealTimeTradeWebSocketClient, times(1)).subscribe(
                    sessionCaptor.capture(),
                    webSocketKeyCaptor.capture(),
                    stockCodeCaptor.capture()
            );
            
            String sessionId = sessionCaptor.getValue().getId();
            
            Map<String, String> stockSessionIndex = getStockSessionIndex();
            Map<String, KisSubscriptionManager.StockSubscriptionContext> stockSubscriptionContextBySession = getStockSubscriptionContextBySession();
            
            // 2. 해당 주식 종목이 연결되고 있는 웹소켓 세션이 역인덱싱이 생성된다.
            assertEquals(sessionId, stockSessionIndex.get(stockCode));
            
            // 3. 해당 주식 종목의 구독 수는 1이다.
            assertEquals(1, stockSubscriptionContextBySession.get(sessionId).getSubscriptionCount(stockCode));
        }
        
        @Test
        @DisplayName("41개 이상의 종목을 구독하는 경우")
        void subscribeMoreThan41Stocks() throws InterruptedException {
            // given
            // 000001, 000045 종목은 구독 수가 2
            String[] stockCodes = {
                    "000001", "000001", "000002", "000003", "000004",
                    "000005", "000006", "000007", "000008", "000009",
                    "000010", "000011", "000012", "000013", "000014",
                    "000015", "000016", "000017", "000018", "000019",
                    "000020", "000021", "000022", "000023", "000024",
                    "000025", "000026", "000027", "000028", "000029",
                    "000030", "000031", "000032", "000033", "000034",
                    "000035", "000036", "000037", "000038", "000039",
                    "000040", "000041", "000042", "000043", "000044",
                    "000045", "000045"
            };
            
            int threadCount = stockCodes.length;
            ExecutorService executorService = Executors.newFixedThreadPool(threadCount);
            CountDownLatch latch = new CountDownLatch(threadCount);
            
            doNothing().when(kisRealTimeTradeWebSocketClient).subscribe(any(WebSocketSession.class), anyString(), anyString());
            
            // when
            for (int i = 0; i < threadCount; i++) {
                final int finalI = i;
                executorService.submit(() -> {
                    try {
                        kisSubscriptionManager.subscribe(stockCodes[finalI]);
                    } finally {
                        latch.countDown();
                    }
                });
            }
            
            executorService.shutdown();
            boolean isTaskCompleted = latch.await(10, TimeUnit.SECONDS);
            
            // then
            // 1. 작업 시간 내 모든 작업이 완료되었는지 확인한다.
            assertTrue(isTaskCompleted, "작업 시간 내 모든 작업이 완료되지 않았습니다.");
            
            // 2. 000001, 000045 종목은 중복 구독이기 때문에 한국투자증권 구독 요청 메서드 호출 횟수는 45회이다.
            verify(kisRealTimeTradeWebSocketClient, times(45)).subscribe(
                    sessionCaptor.capture(),
                    webSocketKeyCaptor.capture(),
                    stockCodeCaptor.capture()
            );
            
            // 3. 역인덱스에는 중복 종목을 제외한 총 45개의 종목이 등록되어 있어야한다.
            Map<String, String> stockSessionIndex = getStockSessionIndex();
            assertThat(stockSessionIndex).hasSize(45);
            
            // 4. 세션 별 역인덱스 사이즈는 41 또는 4이다.
            int session1IndexCount = (int) stockSessionIndex.values().stream()
                    .filter(id -> id.equals(sessionId1))
                    .count();
            int session2IndexCount = (int) stockSessionIndex.values().stream()
                    .filter(id -> id.equals(sessionId2))
                    .count();
            
            assertThat(session1IndexCount).isIn(41, 4);
            assertThat(session2IndexCount).isIn(41, 4);
            
            // 5. 각 세션 별 구독 종목 수는 41 또는 4이다.
            Map<String, KisSubscriptionManager.StockSubscriptionContext> stockSubscriptionContextBySession = getStockSubscriptionContextBySession();
            KisSubscriptionManager.StockSubscriptionContext context1 = stockSubscriptionContextBySession.get(sessionId1);
            Map<String, Integer> context1Subscription = (Map<String, Integer>) ReflectionTestUtils.getField(context1, "subscribedStocks");
            KisSubscriptionManager.StockSubscriptionContext context2 = stockSubscriptionContextBySession.get(sessionId2);
            Map<String, Integer> context2Subscription = (Map<String, Integer>) ReflectionTestUtils.getField(context2, "subscribedStocks");
            
            assertThat(context1Subscription.values().size()).isIn(41, 4);
            assertThat(context2Subscription.values().size()).isIn(41, 4);
        }
    }
}
```

&nbsp; <code>KisSubscriptionManagerTest</code>에서는 주식 종목을 처음 구독하는 시나리오와 41개 이상의 종목을 구독하는 시나리오에 대한 단위 테스트를 진행한다.

## k6 통합 테스트

```js
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import ws from 'k6/ws';

// 0. 공유 데이터 설정
const stockCodes = new SharedArray('stock-codes', function() {
  return JSON.parse(open("./stock-code.json"));
});

// 1. 테스트 설정
export const options = {
  scenarios: {
    websocket_scenario: {
      executor: 'per-vu-iterations',
      vus: stockCodes.length,
      iterations: 1,
      maxDuration: '10s'
    }
  }
};

export default function () {
  // 2. 서버의 웹소켓 엔드포인트 URL 설정
  const url = 'ws://localhost:8080/stomp/websocket';

  // 3. 각 가상 유저(VU)에게 고유한 주식 코드를 할당
  const stockCode = stockCodes[(__VU - 1) % stockCodes.length].stockCode;
  console.log(`${__VU} 번 째 사용자 테스트 시작 : ${stockCode}`);

  // 4. STOMP 프레임 생성
  const connectFrame = `CONNECT\naccept-version:1.1,1.2\nheart-beat:10000,10000\n\n\0`;
  const subscribeFrame = `SUBSCRIBE\nid:sub-0\ndestination:/sub\nstockCode:${stockCode}\n\n\0`;
  const unsubscribeFrame = `UNSUBSCRIBE\nid:sub-0\nstockCode:${stockCode}\n\n\0`;
  const disconnectFrame = `DISCONNECT\n\n\0`;


  // 5. 웹소켓 연결 및 시나리오 실행
  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      console.log(`VU ${__VU}: WebSocket connection opened. Subscribing to ${stockCode}`);
      socket.send(connectFrame);
    });

    socket.on('message', (data) => {
      if (data.startsWith('CONNECTED')) {
        console.log(`VU ${__VU}: STOMP connection successful. Sending SUBSCRIBE frame for ${stockCode}.`);
        socket.send(subscribeFrame);
      } else {
            console.log(`VU ${__VU} ▶ ${stockCode} message: ${data}`);
        }
    });

    socket.on('close', () => {
      console.log(`VU ${__VU}: WebSocket connection closed.`);
    });

    socket.on('error', function (e) {
      console.error(`VU ${__VU}: An unexpected error occurred: ${e.error()}`);
    });

    // 6. 일정 시간 동안 구독 유지 후 종료
    socket.setTimeout(() => {
      console.log(`VU ${__VU}: Unsubscribing and closing connection for ${stockCode}.`);
      socket.send(unsubscribeFrame);
      socket.send(disconnectFrame);
      socket.close();
    }, 10000); // 10초
  });

  // 7. 웹소켓 연결 성공 여부 확인
  check(res, { 'status is 101': (r) => r && r.status === 101 });
}
```

![k6-test-result](/assets/img/docs/web/refact-kis-websocket/k6-test-result.png)

```bash
INFO[0003] VU 6 ▶ 042700 message: MESSAGE
destination:/sub/042700
content-type:application/json
subscription:sub-0
message-id:41b27c35-65b1-89a2-cbc8-a1408f201ea3-79
content-length:123
{"stockCode":"042700","time":"12:52:22","price":134200,"stockCount":1,"volume":1599561,"tradeType":"BUY","changeRate":4.27}  source=console

INFO[0003] VU 6 ▶ 042700 message: MESSAGE
destination:/sub/042700
content-type:application/json
subscription:sub-0
message-id:41b27c35-65b1-89a2-cbc8-a1408f201ea3-80
content-length:123
{"stockCode":"042700","time":"12:52:22","price":134200,"stockCount":1,"volume":1599562,"tradeType":"BUY","changeRate":4.27}  source=console

INFO[0003] VU 17 ▶ 000880 message: MESSAGE
destination:/sub/000880
content-type:application/json
subscription:sub-0
message-id:a504d7df-bb28-6ddb-4d47-1e5abdf1e3a4-81
content-length:122
{"stockCode":"000880","time":"12:52:22","price":82900,"stockCount":42,"volume":121131,"tradeType":"BUY","changeRate":4.02}  source=console

INFO[0004] VU 2 ▶ 035720 message: MESSAGE
destination:/sub/035720
content-type:application/json
subscription:sub-0
message-id:85ed8fc9-0ec1-3ea4-8519-0708f5a2a9d8-94
content-length:121
{"stockCode":"035720","time":"12:52:22","price":59600,"stockCount":1,"volume":698877,"tradeType":"SELL","changeRate":0.0}  source=console
```


&nbsp; 테스트 결과는 다음과 같으며 실제 수신되는 메시지또한 콘솔에 제대로 출력되는 것을 확인하였다.

&nbsp; 위 2가지 테스트를 통해 실제 운용 환경에서 웹소켓 로직이 제대로 동작함을 확인할 수 있었다. 따라서, 구독 가능 종목의 갯수는 41개 → 82개로 늘어나게 되었다.

# 결론

&nbsp; 해당 작업은 시작부터 많은 시간이 걸린 작업이었다.

&nbsp; 웹소켓 세션을 관리하는 지식에 대한 부족함과 특정 종목 구독/해제 로직 및 구조를 고려하여야 하였으며, 동시성 제어가 필요하였다. 이러한 여러가지 이슈들이 복합적으로 내재되어있어 시작부터 많은 생각이 필요하였다.

&nbsp; 기존에 부족했던 지식을 채우고, 기능에 따른 필요 클래스의 책임과 역할을 다시 한 번 강조하며 구조를 설계하였다. 

&nbsp; 이 덕분에, <u>여러 개의 다중 계좌를 사용하더라도 유동적으로 갯수를 늘릴 수</u> 있게 되었다. 결과적으로는 이번 작업을 통해 <u>구독 가능 주식 종목을 41개 → 82개로 늘릴 수 있게</u> 되었다.

&nbsp; 많은 시간이 걸린만큼 더욱 큰 성취감이 느껴지는 작업이었이며, 해당 작업을 통해 특정 기술과 사용법에 대한 기초적인 지식과 구조 설계가 얼마나 중요한지 깨닫게 되었다.

&nbsp; 그러나, 이번 작업에서 클라이언트의 웹소켓을 통한 요청에 대한 예외 처리나 클라이언트가 비정상적으로 종료하여 구독 해제가 불가능한 경우를 대비한 Spring Event 처리 등과 같은 추가적인 이슈들은 해결하지 못하였다. 해당 이슈들은 한 번 더 정리하여 다음 작업에서 진행할 예정이다.