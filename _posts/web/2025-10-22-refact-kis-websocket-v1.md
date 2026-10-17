---
layout: posts
title:  "한국투자증권 웹소켓 구독수  제한 정책 극복기"
author_profile: true
sidbar:
  nav: "main"
category: "web"
description: "모의 주식 투자 서비스 '무주시'를 되돌아보며 이전부터 여러가지 문제가 발생했었던 한국투자증권 웹소켓 관련 부분을 리팩토링하기로 하였다. 기본적으로 한국투자증권에서는 세션 당 웹소켓 호출(구독 수) 유량 제한 정책으로 인하여 하나의 세션 당 41개의 종목에 대한 구독이 가능하다. 따라서, 다중 계좌를 사용하여 운용 가능 웹소켓 세션 수를 늘려 해당 정책에 대응하고자 한다. 또한, 이전부터 발생하였던 웹소켓 세션을 저장하기 위하여 해당 필드를 static 변수로 선언하여야지만 저장이 가능했던 이슈 등에 관한 내용을 다뤄보고자 한다."
published: true
show_date: true
---

# \# 서론

&nbsp; 최근 모의 주식 투자 서비스 '무주시(무자본 주식 시뮬레이션)'를 되돌아보며 과거의 부족함을 느끼고, 구조 및 기능적으로 개선할 부분을 리팩토링하고 있다. 해당 리팩토링의 가장 큰 목표는 **'한국투자증권 웹소켓 호출(구독 수) 유량 제한 정책 극복'**에 있다. 한국투자증권에서는 기본적으로 API나 웹소켓에 대하여 [호출 유량 제한 정책](https://apiportal.koreainvestment.com/community/10000000-0000-0011-0000-000000000001/post/d0d1a83f-6f8d-4437-9700-6d26702fd989)을 시행하고 있다. 웹소켓의 경우에는 하나의 세션 당 41개의 종목까지 구독이 가능하다. 또한, 하나의 세션은 하나의 개발자센터 계좌만 사용하기 때문에 실시간 체결가와 같은 정보를 제공하는데에는 어려움이 있다. 

&nbsp; 이전부터 해당 문제에 대한 개선을 시도하였지만, 웹소켓 세션 관리 방법에 대한 지식 부족과 웹소켓 관련 시스템 구조가 만족스럽지 않아 해당 PR을 병합해보지는 못하였다. 이번 기회를 통하여 웹소켓 세션 관리 방법을 중점적으로 하여 리팩토링을 심도있게 진행해보기로 하였다. 프로젝트를 같이하는 팀원이 있기에 해당 팀원의 계좌를 추가적으로 사용하여 2개의 계좌로 웹소켓 접속키를 발급하여 <u>2개의 웹소켓 세션을 운용하여 총 구독 가능 종목 수를 41 * 2 = 82 개로 늘려</u>보고자 한다.


&nbsp; 웹소켓 세션의 구독 종목 데이터 수 제한 외에도 `CompletableFuture`를 통해 웹소켓 세션을 연결해야하는 특성을 고려하지 못한 설계로 인한 문제 등도 존재하였다.

## 배경: 웹소켓 구조

&nbsp; '무주시' 프로젝트에서는 2가지 웹소켓 연결이 존재한다.

1. 클라이언트 - 서버: 실시간 체결가 정보 확인을 위한 웹소켓 연결 목적
2. 서버 - 한국투자증권: 실시간 체결가 제공을 위한 실제 데이터 수신 목적

&nbsp; 클라이언트가 특정 주식 종목의 상세 페이지에 접속하였을 때, 국내 주식 시장이 개장 중이면 해당 종목의 실시간 체결가를 확인할 수 있다. 이때, 실시간 체결가는 웹소켓을 통해 전달되면 수신된 실시간 체결가 정보가 계속해서 갱신된다.

&nbsp; 서버는 특정 주식 종목의 상세 페이지에 접속한 클라이언트가 존재할 경우, 해당 클라이언트에게 실시간 체결가를 제공하기 위해서 한국투자증권 웹소켓 서버와 연결 후 실시간 체결가 구독을 요청해야 한다.

![real-time-trade-ws-architecture](/assets/img/docs/web/refact-kis-websocket/real-time-trade-ws-arch.png)

&nbsp; 실시간 체결가를 제공하는 종목은 '구독'이라는 행위를 통해서 관리된다. 구독되고 있는 종목에 대해서는 한국투자증권 웹소켓 서버에 실시간 체결가 구독 요청을 보내야한다.

1. **[클라이언트 → 서버]** 구독 요청

    &nbsp; 클라이언트가 특정 종목의 상세 페이지에 접속하면 서버와 웹소켓 연결 및 해당 종목에 대한 구독 요청을 보낸다.

2. **[서버]** 구독 종목 추가

    &nbsp; 서버에서는 실시간 체결가 제공을 위해 클라이언트가 구독하고 있는 종목을 관리해야한다. 따라서, 클라이언트의 특정 종목에 대한 구독 요청이 들어오면 서버에서는 해당 종목을 현재 관리 중인 구독 종목에 추가해야한다.

3. **[서버 → 한국투자증권]** 국내주식 실시간 체결가 특정 종목 구독 요청

    &nbsp; 서버에서는 특정 주식 종목이 처음 구독된 경우 [한국투자증권 국내주식 실시간 체결가](https://apiportal.koreainvestment.com/apiservice-apiservice?/tryitout/H0STCNT0) 웹소켓을 통해 해당 종목 구독 요청을 보낸다.

4. **[한국투자증권 → 서버]** 국내주식 실시간 체결가 응답

    &nbsp; 한국투자증권에서는 해당 종목에 대한 실시간 체결가를 제공한다.

5. **[서버 → 메시지브로커]** 실시간 체결가 발행

    &nbsp; 클라이언트들에게 실시간 체결가를 안정적으로 전달하기 위해 메시지브로커(Redis Pub/Sub)를 사용한다. 따라서, 한국투자증권으로부터 수신받은 실시간 체결가를 메시지 브로커로 발행한다.

6. **[메시지브로커 → 서버]** 실시간 체결가 수신

    &nbsp; 서버에서는 메시지브로커에서 발행된 메시지를 수신한다.

7. **[서버 → 클라이언트]** 웹소켓 메시지 수신

    &nbsp; 서버에서는 수신된 실시간 체결가 메시지를 받아 특정 주식 종목을 구독 중인 클라이언트에게 해당 종목의 실시간 체결가를 전달한다.

&nbsp; 클라이언트가 보고있는 특정 주식 종목에 대한 실시간 체결가의 안정적인 관리와 전달을 위해 위와 같은 프로세스를 구상하였다. 또한, 구독 중인 종목의 구독 해지 과정도 동일한 프로세스로 진행된다.

&nbsp; 위 프로세스에서 가장 중요한 것은 **구독 종목 관리**와 **한국투자증권과 연결된 세션 당 현재 구독 수**를 관리하는 것이다. 따라서, 아래와 같은 규칙을 정하고 이를 구현하였다.

- 웹소켓 세션 : 웹소켓 접속키 = 1 : 1 로 대응되어 관리되어야 한다. 
- 특정 종목이 이미 구독되고 있을 경우에는 한국투자증권에 추가적인 구독 요청이 필요없다. 
- 특정 종목에 대한 구독이 존재하지 않는 경우, 한국투자증권에 구독 해제 요청을 보내야한다.
- 해당 종목을 구독한 웹소켓 세션과 웹소켓 접속키를 알아야 구독 해제 요청이 가능하다. 

## 기존 연결 구조의 문제점과 원인 파악

```java
@Configuration
@EnableWebSocket
@RequiredArgsConstructor
public class KisWebSocketConfig implements WebSocketMessageBrokerConfigurer {
    private final KisProperties kisProperties;
    private final KisRealTimeTradeHandler kisRealTimeTradeHandler;

    // Scheduler를 통한 WebSocketConnectionManager.start()를 호출
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

&nbsp; 기존 코드에서는 `WebSocketConnectionManager`를 빈으로 등록하여서 웹소켓 연결을 관리하였다. 

&nbsp; `WebSocketConnectionManager`를 사용한 웹소켓 예제들이 많고, 간단한 사용법을 가진 방법이기에 해당 방법을 선택하여 웹소켓 연결 로직을 구현하였다.

&nbsp; 그러나, `WebSocketConnectionManager`의 사용이 간단한만큼 많은 추상화가 진행되어 세밀한 웹소켓 연결과 세션 관리의 어려움이 존재한다.

### WebSocketConnectionManager

```java
// org.springframework.web.socket.client.WebSocketConnectionManager
public class WebSocketConnectionManager extends ConnectionManagerSupport {
    private final WebSocketClient client;
    private final WebSocketHandler webSocketHandler;
    @Nullable
    private WebSocketSession webSocketSession;

    // ...
}
```

&nbsp; `WebSocketConnectionManger`의 내부를 확인해보면 `WebSocketSession`을 멤버 변수로 가지고 있다. 즉, 단순히 메서드를 호출하여 웹소켓 세션을 연결/종료할 수 있다는 장점은 있지만, 객체 내부에서 웹소켓 세션을 알아서 관리하기 때문에 웹소켓 세션을 직접 제어하고 관리하기에는 어려움이 존재한다.

### WebSocketClient

&nbsp; 또한, 웹소켓 연결 요청을 진행하는 실질적인 클래스(인터페이스)는 `WebSocketClient`이다. `WebSocketClient`는 웹소켓 세션 연결/종료를 직접적으로 수행하고, 연결된 웹소켓 세션을 반환하는 클래스이다.

![WebSocketClient](/assets/img/docs/web/refact-kis-websocket/web-socket-client-interface.png)

&nbsp; `WebSocketClient`는 내부의 `.dohandshake()`와 `.execute()` 메서드의 반환값은 `Future<WebSocketSession>`이다. 

&nbsp; 따라서, `WebSocketClient`를 통해 직접 웹소켓을 연결하여야지만 반환값으로 웹소켓 세션을 반환받아 관리할 수 있다.

### CompletableFuture

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

&nbsp; `CompletableFuture<T>` 클래스에서는 `get(long timeout, TimeUnit unit)`(타임아웃 시간을 지정) 메서드, `join()`(반환값을 받아올 때까지 지속) 메서드를 통해 비동기 작업이 끝난 뒤 반환값을 받을 수 있다.

# \# 본론

> \# **Related Pull Request** <br/>[Refact: 한국투자증권 웹소켓 연결 세션 증설 및 구독 관리 로직 리팩토링](https://github.com/Team-Digimon/muzusi-was/pull/122)

&nbsp; 앞서 `WebSocketConnectionaManager`를 사용한 웹소켓 세션 연결 구조에는 세밀한 웹소켓 세션 제어에는 한계가 있음을 인식하고, `WebSocketClient`를 통한 웹소켓 연결으로 `WebSocketSession`을 가져오는 방법이 해결 방법임을 파악할 수 있었다.

![ws-diagram](/assets/img/docs/web/refact-kis-websocket/ws-diagram.png)

&nbsp; 따라서, 위 해결 방법을 고려하여 새로 설계한 구조의 다이어그램은 위와 같다.

&nbsp; 크게 '초기화 과정'과 '구독·해제 요청 처리 과정'으로 나뉜다.

## 초기화 과정

&nbsp; 애플리케이션 초기화 과정에서는 국내 주식 시장 개장 시간이라면 웹소켓 접속키를 발급하고, 해당 접속키를 통해 한국투자증권 웹소켓 서버와 세션 연결을 하고 연결된 세션을 저장한다.

### KisWebSocketSessionManager

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

    // ...
    
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

&nbsp; `KisWebSocketSessionManager`는 웹소켓 세션을 저장하고 관리하는 클래스이다.

&nbsp; 스케줄러를 통해 `initializeSessions()` 메서드를 호출하게 되면 `KisWebSocketConnector`를 통해 한국투자증권과 웹소켓 세션을 연결한 뒤 저장한다.

&nbsp; 웹소켓 세션과 해당 웹소켓 세션이 한국투자증권과 통신에 사용하는 **웹소켓 접속키는 1대1로 관리해야하기 때문**에 웹소켓 세션과 해당 세션이 사용하는 웹소켓 접속키를 묶어 관리한다.

### KisWebSocketConnector

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

&nbsp; `KisWebSocketConnector`는 한국투자증권 웹소켓 서버와 연결을 시도하여 연결된 세션을 반환하는 클래스이다. `WebSocketClient`의 구현체인 `StandartWebSocketClient`를 통해 세션을 연결한다. 

&nbsp; `WebSocketClient.execute(handler, domain)`은 `CompletableFuture<WebSocketSession>`을 반환하기 때문에 `.join()` 메서드를 통해 비동기로 연결된 웹소켓 세션을 받아 반환한다.

### KisSubscriptionManager

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
     * 웹소켓 세션 ID 목록을 인자로 받아, 웹소켓 세션 ID 별 구독 목록 Map을 초기화하는 메서드
     *
     * @param sessionIds    초기화할 웹소켓 세션 ID 목록
     */
    public void initialize(List<String> sessionIds) {
        for (String sessionId : sessionIds) {
            stockSubscriptionContextBySession.put(sessionId, new StockSubscriptionContext());
        }
    }

    // ...

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

&nbsp; `KisWebSocketSessionManager.initializeSessions()`를 통해 반환된 웹소켓 세션들은 `KisSubscriptionManager.initialize(List<String> sessions)`을 통해 `KisSubscriptionManager`에 저장된다.

&nbsp; `KisSubscriptionManager`는 특정 종목의 구독을 진행한 웹소켓 세션도 동시에 관리를 해야하기 때문에 `Map<웹소켓 세션 ID, 구독 종목 컨텍스트>`를 초기화한다.

&nbsp; 각 웹소켓 세션마다 구독 중인 종목과 구독 횟수를 나타내는 자료구조(클래스)인 `StockSubcriptionContext`를 내부 클래스로 가진다.

## 구독·해제 요청 처리 과정

### StompInterceptor

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

&nbsp; `StompInterceptor`는 `ChannelInterceptor`의 구현체로 클라이언트의 STOMP 웹소켓 연결 요청을 인터셉트하여 구독·해제 요청을 처리한다.

&nbsp; STOMP 웹소켓 연결 요청의 헤더에 `stockCode` 커스텀 헤더를 두어 클라이언트가 상세 페이지에 접속한 주식 종목 코드를 전달하며, `StockSubscriptionManager.subscribe(stockCode)`, `.unsubscribe(stockCode)` 메서드를 통해 구독·해제 요청을 처리하게 된다.

### KisStockSubscriptionManager

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
    
    // ...
}
```

&nbsp; `KisStockSubscriptionManager` 구독 주식 종목 관리 뿐만 아니라 새로운 종목의 구독 요청에 대해서는 실제 한국투자증권 실시간 체결가 웹소켓 구독 요청을 보내고, 구독 해제 요청 처리 후 더 이상 구독이 존재하지 않을 경우 해당 종목에 대한 구독 해제 요청을 보낸다.

&nbsp; 이 과정에서 구독·해제 요청을 위해 웹소켓 세션 ID가 필요하다. 구독 요청을 진행한 웹소켓 세션과 해당 세션이 사용하는 웹소켓 접속키를 이용하여 요청을 보내야하기 때문이다. 이를 위해 `<종목 코드, 해당 종목이 구독되고 있는 웹소켓 세션 ID>` 쌍으로 저장하는 **'역인덱스 맵'**을 만들어 관리한다. 구독 해제 요청 시 역인덱스 맵을 통해 해당 종목이 구독되고 있는 웹소켓 세션 ID를 바로 조회하여 실제 구독 해제 요청을 진행할 수 있다. 

&nbsp; 또한, 역인덱스맵에 존재한다는 것은 **"해당 종목은 이미 구독되고 있다"**는 의미이다. 따라서, 해당 종목이 이미 구독 중인 상태라면 더 이상이 실제 실시간 체결가 구독 요청을 보낼 필요는 없기에 분기 조건으로도 활용할 수 있다.

&nbsp; 구독·해제 메서드는 모두 `ReentrantLock`을 통해 임계 영역으로 보호된다. 클라이언트의 주식 종목 상세 페이지 접근은 동시에 일어날 수 있는 작업이며, 구독 수 관리가 정합성 및 서버 자원 낭비 방지로 이어지기 때문이다. 이때, Redis 분산락과 같은 외부 락도 고려하였지만 해당 프로젝트는 단일 서버이며, 상세 페이지에 접근 및 구독·해제 재요청이 쉬운 구조이기 때문에 `ReentrantLock`의 단순성을 높게 평가하여 도입을 결정하게 되었다.

### KisRealTimeTradeWebSocketClient

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

&nbsp; `KisRealTimeTradeWebSocketClient`는 한국투자증권 웹소켓 서버로 구독·해제 요청을 보내는 클래스이다. 

&nbsp; 한국투자증권 웹소켓 메시지는 평문으로 송수신하기 때문에 구독·해제 요청에 필요한 필드를 평문 문자열로 변환하여 `TextMessage` 객체로 감싸 요청을 전달한다.


### KisRealTimeTradeWebSocketHandler

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

&nbsp; `KisRealTimeTradeWebSocketHandler`는 한국투자증권 웹소켓 서버로부터 수신되는 '실시간 체결가' 메시지 정보를 파싱하여 메시지브로커로 전달하는 핸들러이다.

&nbsp; `WebSocketClient`를 통한 세션 연결 시 해당 클래스를 핸들러로 지정한다.

&nbsp; 수신된 메시지는 `handleTextMessage(...)` 메서드를 통해 처리할 수 있다. 

&nbsp; 한국투자증권에서는 단순히 구독 요청 결과 메시지 응답 뿐만 아니라 구독 요청이 존재하지 않을 경우 세션 연결 유지를 위하여 핑퐁 메시지를 보내며, 별도의 예외 메시지도 `rt_cd` 필드를 통해 나타내기 때문에 이를 구분하여 적절하게 처리한다.

&nbsp; 핑퐁 메시지는 응답을 그대로 다시 보내며, 에러 메시지가 발생한 경우 예외를 출력한다.

&nbsp; 정상적인 실시간 체결가 응답이 온 경우 `TradeNotificationPublisher`를 통해 외부 메시지브로커로 메시지를 발행한다.

### TradeNotificationPublisher

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

&nbsp; `TradeNotificationPublisher`는 외부 메시지브로커(Redis Pub/Sub)으로 실시간 체결가 정보를 발행하는 역할을 담당한다.

### TradeNotificationListener

```java
@Component
@RequiredArgsConstructor
@Slf4j
public class TradeNotificationListener implements MessageListener {
    private final RedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final SimpMessageSendingOperations messagingTemplate;

    @Override
    public void onMessage(Message message, byte[] pattern) {
        try {
            String received =(String) redisTemplate.getStringSerializer().deserialize(message.getBody());
            TradeNotificationDto tradeNotification = objectMapper.readValue(received, TradeNotificationDto.class);

            messagingTemplate.convertAndSend("/sub/" + tradeNotification.stockCode(), tradeNotification);
        } catch(Exception e) {
            log.error("[Error/TradeNotification] 실시간 체결가 알림 처리 실패", e);
        }
    }
}
```

&nbsp; `TradeNotificationListener`는 외부 메시지브로커(Redis Pub/Sub)으로부터 메시지를 수신받아 웹소켓을 통하여 클라이언트(해당 종목의 실시간 체결가 구독자)에게 실시간 체결가를 전달하는 역할을 수행한다.

&nbsp; 클라이언트가 STOMP 웹소켓 연결 요청 후, `/sub/{stockCode}` 경로로 구독 요청을 보내기 때문에 해당 경로를 통해 구독자들에게 실시간 체결가를 제공한다.

## 테스트

### 단위 테스트

&nbsp; 테스트는 `KisSubscriptionManager`에 대한 단위 테스트와 구독/해제 로직에 대한 통합 테스트를 진행하였다. 통합 테스트는 k6를 통한 동시 사용자 수를 설정하여 실제 환경을 고려하여 테스트를 진행하였다.

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

### k6 통합 테스트

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

&nbsp; 위 2가지 테스트를 통해 실제 운영 환경에서 웹소켓 로직이 제대로 동작한다는 것을 확인할 수 있었고, 이는 구독 가능 종목이 41개 → 82개로 늘어나게 됨을 의미한다.

# \# 결론

&nbsp; 해당 작업은 시작부터 많은 시간이 걸린 작업이었다.

&nbsp; 웹소켓 세션을 관리하는 지식에 대한 부족함과 특정 종목 구독/해제 로직 및 구조를 고려하여야 하였으며, 동시성 제어가 필요하였다. 이러한 여러가지 이슈들이 복합적으로 내재되어있어 시작부터 많은 생각이 필요하였다.

&nbsp; 기존에 부족했던 지식을 채우고, 기능에 따른 필요 클래스의 책임과 역할을 다시 한 번 강조하며 구조를 설계하였다. 

&nbsp; 이 덕분에, <u>여러 개의 다중 계좌를 사용하더라도 유동적으로 갯수를 늘릴 수</u> 있게 되었다. 결과적으로는 이번 작업을 통해 <u>구독 가능 주식 종목을 41개 → 82개로 늘릴 수 있게</u> 되었다.

&nbsp; 많은 시간이 걸린만큼 더욱 큰 성취감이 느껴지는 작업이었이며, 해당 작업을 통해 특정 기술과 사용법에 대한 기초적인 지식과 구조 설계가 얼마나 중요한지 깨닫게 되었다.

&nbsp; 그러나, 이번 작업에서 클라이언트의 웹소켓을 통한 요청에 대한 예외 처리나 클라이언트가 비정상적으로 종료하여 구독 해제가 불가능한 경우를 대비한 Spring Event 처리 등과 같은 추가적인 이슈들은 해결하지 못하였다. 해당 이슈들은 한 번 더 정리하여 다음 작업에서 진행할 예정이다.