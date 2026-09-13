---
layout: posts
title:  "한국투자증권 웹소켓 세션과 구독 종목 관리 책임 분리"
author_profile: true
sidbar:
  nav: "main"
category: "web"
description: "모의 주식 투자 서비스 '무주시'를 리팩토링하며 가장 먼저 한국투자증권 실시간 체결가 웹소켓 세션 및 구독 관리 구조를 되돌아보았다. 이전에도 리팩토링을 진행하였지만, 그 과정에서도 구조에 대한 몇 가지 의문이 남아있었다. 웹소켓 세션과 구독 종목 관리 책임이 혼재되어 있어 계층간 경계가 모호하다는 느낌을 받았었다. 특히, 도메인 주도 설계와 헥사고날 아키텍처의 Port&Adapter를 통해 외부 인프라와 계층간 결합도를 분리하는 중요성에 대한 지식을 얻은 뒤 기존 리팩토링 구조에 대한 아쉬움이 크게 부각되었다. 이번 포스팅에서는 기존 리팩토링 구조에서 위와 같은 아쉬웠던 문제를 개선해 피드백한 과정을 정리하고자 한다."
published: true
show_date: true
---

# \# 서론

&nbsp; 이전 포스팅 [한국투자증권 웹소켓 호출 유량 제한 정책 대응을 위한 다중 계좌 사용하기](/web/refact-kis-websocket-v1/)에서 한국투자증권 실시간 체결가 웹소켓 구독을 위하여 웹소켓 세션과 구독 종목을 관리 구조를 리팩토링하였다. 

&nbsp; 이전 리팩토링 후에도 몇 가지의 의문점들이 남았었다. 웹소켓 세션과 구독 종목 관리 책임이 혼재되어 있고, 웹소켓 세션 핸들러는 실시간 체결가 처리에만 집중되어 있어 기타 웹소켓 API 연결과 같은 확장에 경직되어 있다는 느낌을 받았었다. 특히 도메인 주도 설계와 헥사고날 아키텍처의 Port & Adapter를 통해 계층간 결합도를 분리하고, 책임을 명확히 나누는 구조에 대해 이전과는 다른 시선으로 해당 구현을 되돌아보았다. 

&nbsp; 이번 포스팅에서는 또 다른 시선으로 기존 리팩토링 후 구조를 되돌아보고, 책임과 역할 분리를 더욱 명확히하여 더 나은 구조를 도입한 경험과 사고 과정을 정리해보고자 한다.

# \# 본론

## 이전 리팩토링 구조에서의 문제점

&nbsp; [KisSubscriptionManager](https://github.com/Team-Digimon/muzusi-was/blob/179a100fa8b094b6d79cee0b7605b8a57d69f08f/src/main/java/muzusi/application/websocket/service/KisSubscriptionManager.java)는 기존 리팩토링에서 실시간 체결가 기능 제공을 위한 구독 종목을 관리하던 핵심 클래스이다.

&nbsp; 그러나, 해당 클래스에서는 아래와 같은 문제점들이 존재한다.

- 한국투자증권(외부 인프라) 세션 관리자를 직접 의존
- 구독 종목 관리 책임과 실제 구독·해제 요청의 책임이 혼재되어 낮은 응집도를 가짐
- 클라이언트의 주식 종목 구독 요청 실패에 대한 예외 처리 채널의 부재
- 다른 역할을 가진 클래스와 네이밍이 겹쳐 클래스 의미 파악이 저하

&nbsp; 위와 같은 주요 문제점들이 존재하며 '단일 책임 원칙'을 준수하는 것을 우선 목표로 설정하여 구조를 재설계하고자 하였다.

```java
@Component
@RequiredArgsConstructor
public class KisSubscriptionManager {
    // 한국투자증권 웹소켓 세션 관리자를 직접 의존 
    private final KisWebSocketSessionManager kisWebSocketSessionManager;
    private final KisRealTimeTradeWebSocketClient kisRealTimeTradeWebSocketClient;

    /* 웹소켓 세션과 해당 세션을 통해 구독 중인 종목을 관리 */
    private final Map<String, StockSubscriptionContext> stockSubscriptionContextBySession = new LinkedHashMap<>();
    
    // ...

    /* 한국투자증권과 연결된 세션을 삽입 - kisWebSocketSessionManager에 세션을 삽입 */
    public void initialize(List<String> sessionIds) { ... }

    /* 한국투자증권과 연결된 세션을 초기화 - kisWebSocketSessionManager의 세션을 초기화 */
    public void clearSubscriptions() { ... }

    /* 주식 종목을 구독 - 처음 구독 시 kisRealTimeTradeWebSocketHandler를 통한 실제 구독 요청 */
    public void subscribe(String stockCode) { ... }

    /* 추가 구독이 가능한 웹소켓 세션의 id를 반환하는 메서드 - stockSubscriptionContextBySession Map에서 구독 가능 세션을 조회 */
    private String getAvailableSessionId() { ... }

    /* 주식 종목의 구독을 해제 - 마지막 구독 해제시 kisRealTimeTradeWebSocketHandler를 통한 실제 구독 해제 요청 */
    public void unsubscribe(String stockCode) { ... }

    /* 웹소켓 세션과 세션별 구독 종목을 관리하는 자료 구조 */
    public static class StockSubscriptionContext { ... }
}
```

&nbsp; `KisSubscriptionManger`에서는 위와 같이 많은 책임이 혼재되어 있었다. 또한, `KisSubscriptipionManager`의 문제점을 정리하면 아래와 같다.

### 1. 클래스명에 외부 인프라를 포함

&nbsp; `KisSubscriptionManager`는 실시간 체결가 제공을 위한 주식 종목 구독을 관리하는 비즈니스 로직을 담당한다. 

&nbsp; 웹소켓 세션당 구독 가능 종목 수를 관리하는 로직 자체는 한국투자증권 웹소켓의 호출 유량 제한이라는 제약을 해결하기 위해 도입되었지만, 이 제약과 무관한 구독 관리라는 비즈니스 로직에마저 `Kis`라는 외부 벤더명이 클래스명에 그대로 노출되어 있다. 

&nbsp; 이는 단순한 네이밍의 문제라기보다 비즈니스 로직을 담당하는 application 영역의 코드 구조에 특정 벤더(한국투자증권)에 종속되어있음을 드러내는 신호로, 향후 실시간 체결가 제공 벤더가 교체되거나 다른 증권사가 추가된다면, 구독 관리라는 비즈니스 로직 자체는 변하지 않았음에도 클래스명과 그에 얽힌 코드 전반을 수정해야하는 상황에 놓이게 된다.

### 2. 외부 인프라(KIS)에 대한 직접 의존

&nbsp; `KisSubscriptionManager`는 application 영역에서 실시간 체결가 제공을 위한 주식 종목 구독을 담당하는 비즈니스 로직을 수행한다. 그러나, 이 클래스는 한국투자증권 웹소켓 서버와 연결된 세션을 저장하는 `KisWebSocketSessionManager`와 실제 구독·해제 요청을 전송하는 `KisRealTimeTradeWebSocketClient`를 필드로 직접 주입받고 있다.

&nbsp; 구독 관리라는 비즈니스 로직이 "어떤 종목을 구독할 것인가"를 다뤄야만 함에도 불구하구, 정작 그 구독을 실현하는 구체적인 수단까지 직접 알고 의존하는 구조이다. 결국 그 결과 구독 관리 로직만을 독립적으로 검증하려 해도 KIS 인프라 구현까지 mocking해야하며, 향후 인프라가 교체되거나 확장될 경우에도 구독 관리 로직 자체에 변경이 전파될 수 밖에 없다. 이는 상위 정책(구독 관리)이 하위 구현(인프라 연동)에 종속되는 의존성 역전 원칙 위반 사례라고 판단하였다.

### 3. 구독 상태 관리와 실제 구독 요청 책임의 혼재

&nbsp; `KisSubscriptionManager.subscribe()`는 특정 종목에 대한 구독 요청이 들어왔을 때, 구독 가능한 세션을 탐색하고 내부 구독 관리 상태까지 갱신함과 동시에, 해당 종목에 대한 최초 구독일 경우 한국투자증권 웹소켓에 실제 구독 요청까지 전송한다. `unsubscribe()` 역시 구독 상태를 갱신하는 로직과, 마지막 구독이 해제될 떄 실제 구독 해제 요청을 보내는 로직이 하나의 메서드 안에서 함께 존재한다.

&nbsp; 즉, 해당 클래스는 "어떤 종목이 어떤 세션에서 구독 중인가"라는 상태 관리의 책임과 "그 상태 변화에 따라 외부 인프라에 실제로 무엇을 요청할 것인가"라는 책임을 동시에 지고 있다. 두 책임의 변경의 이유가 서로 다르다. 세션 할당 전략이나 상태 저장 방식이 바뀔 수도 있고, 실제 구독 요청을 보내는 방식이 바뀔 수도 있다. 그러나 지금 이 구조에서는 둘 중 하나만 바뀌어도 같은 클래스의 같은 메서들르 함께 수정해야하므로 응집도가 낮고, 각 책임을 독립적으로 테스트하거나 재사용하기도 어렵다.

### 4. 다른 역할을 가진 클래스들끼리 네이밍이 겹쳐 의미 파악 저하

&nbsp; `KisSubscriptionManager`, `KisWebSocketSessionManager` 등 `Manager` 접미사가 붙은 클래스를 구독과 웹소켓 세션 관리라는 기능 전체를 관리하는 클래스명으로 되게 모호한 이름이라 생각한다. 현재 구현에서는 클래스의 응집도가 낮아 담당하는 책임이 크기때문에 `Manager`라는 네이밍을 붙였지만, 이름 자체에서 클래스 의미 파악이 어렵다는 문제점을 느꼈다.

## 문제점을 개선하여 새로 리팩토링을 진행 

![refact-architecture-diagram](/assets/img/docs/web/refact-kis-websocket-v2/refact-architecture-diagram.png)

&nbsp; 개선된 실시간 체결가 구독 관련 구조를 위 다이어그램으로 표현하였다.

&nbsp; 구독 종목 관리는 application 영역, 한국투자증권과 연결된 웹소켓 세션 관리는 infrastructure 영역으로 분리하고 이는 Port & Adapter 패턴을 통해 연결하였다.

### application 레이어

```java
@Slf4j
@Service
@RequiredArgsConstructor
public class StockQuoteSubscriptionService {
    private final StockQuotePort stockQuotePort;
    private final StockQuoteSubscriptionRegistry registry;
    
    /* 주식 시세 연동 포트를 통해 연결(Connection)을 받아와 구독 저장소를 초기화하는 메서드 */
    public void setupSubscription() {
        List<String> connectionIds = stockQuotePort.connect();
        registry.initialize(connectionIds);
    }
    
    /* 구독 저장소 초기화를 해제하는 메서드 */
    public void resetSubscription() {
        registry.reset();
    }
    
    /* 구독 메서드 - 해당 종목에 대한 최초 구독인 경우에 stockQuotePort를 통해 실제 구독 요청 */
    public void subscribe(String stockCode) throws InterruptedException {
        StockQuoteSubscriptionResult.Subscription result = registry.subscribe(stockCode);

        if (!result.isSuccess()) {
            log.error("Failed to subscribe stock - {}", stockCode);
            throw new StockQuoteException(stockCode, StockQuoteErrorType.FAIL_SUBSCRIPTION);
        }

        log.info("Success to subscribe stock - session: {} / stockCode: {}", result.sessionId(), stockCode);

        if (result.isNewSubscription()) {
            stockQuotePort.subscribe(result.sessionId(), stockCode);
            log.info("Try a new subscription connection - session: {} / stockCode: {}", result.sessionId(), stockCode);
        }
    }
    
    /* 구독 해제 메서드 - 해당 종목에 대한 마지막 구독이 해제된 경우에 stockQuotePort를 통해 실제 구독 해제 요청 */
    public void unsubscribe(String stockCode) throws InterruptedException {
        StockQuoteSubscriptionResult.Unsubscription result = registry.unsubscribe(stockCode);
        
        if (!result.isSuccess()) {
            log.error("Failed to unsubscribe stock - {}", stockCode);
            throw new StockQuoteException(stockCode, StockQuoteErrorType.FAIL_UNSUBSCRIPTION);
        }
        
        log.info("Success to unsubscribe stock - session: {} / stockCode: {}", result.sessionId(), stockCode);
        
        if (result.isDeleted()) {
            stockQuotePort.unsubscribe(result.sessionId(), stockCode);
            log.info("Try a disconnect subscription connection - session: {} / stockCode: {}", result.sessionId(), stockCode);
        }
    }
}
```

&nbsp; `StockQuoteSubscriptionService`는 구독·해제 요청 유즈케이스를 담당한다. 앞서 `KisSubscriptionManager`와 달리 내부에서 직접 구독 상태 관리하는 것이 아닌 `StockQuoteSubscriptionRegistry`를 통해 구독 종목을 관리한다.

&nbsp; 또한, `StockQuotePort`를 통해 외부 벤더 연동 클래스와의 직접 의존을 끊어 향후 실시간 체결가 제공 벤더의 변경에도 영향이 적은 구조를 확보하였다.

```java
@Component
public class StockQuoteSubscriptionRegistry {
    // <sessionId, <stock, stock_subscription_count>>를 관리하는 Map
    private final Map<String, StockQuoteSubscriptionContext> subscriptionContextMap = new HashMap<>();
    // 특정 주식 종목이 구독되고 있는 웹소켓 세션을 저장하는 역인덱스 Map
    private final Map<String, String> stockSessionIndex = new HashMap<>();
    // 실시간 체결가 제공 벤더와 연결된 웹소켓 세션 id 목록
    private final List<String> sessionIds = new ArrayList<>();
    // 공정 세션 분배를 위한 커서
    private int sessionCursor = 0;

    private final ReentrantLock lock = new ReentrantLock(true);

    @Value("${kis.websocket-subscription-limit}")
    private int capacity;

    /**
     * 외부 웹소켓 세션 목록을 통해 구독 레지스트리를 초기화하는 메서드
     *
     * 각 웹소켓 세션 아이디 당 컨텍스트({@link StockQuoteSubscriptionContext})를 할당한다.
     * 향후 세션 공정 분배를 위해 세션 아이디 목록 컬렉션을 저장한다.
     *
     * @param connectedSessionIds 연결에 성공한 웹소켓 세션 ID 목록
     */
    public void initialize(List<String> connectedSessionIds) {
        lock.lock();

        try {
            for (String sessionId : connectedSessionIds) {
                subscriptionContextMap.put(sessionId, new StockQuoteSubscriptionContext(sessionId, capacity));
            }
            sessionIds.addAll(connectedSessionIds);
        } finally {
            lock.unlock();
        }
    }

    /**
     * 레지스트리 내 모든 구독 관련 상태(컨텍스트, 역인덱스, 세션 목록)를 초기화 해제하는 메서드
     */
    public void reset() {
        lock.lock();

        try {
            subscriptionContextMap.clear();
            stockSessionIndex.clear();
            sessionIds.clear();
        } finally {
            lock.unlock();
        }
    }

    /**
     * 특정 주식 종목에 대한 구독 메서드
     *
     * 이미 구독 중인 종목이면 할당된 세션의 컨텍스트, 신규 구독 종목이면 공정 분배 정책으로 특정 세션 컨텍스트를 가져온다.
     * 선정된 세션 컨텍스트를 활용해 구독을 진행한다.
     *
     * @param stockCode 구독할 주식 종목 코드
     * @return 구독 처리 결과 DTO(세션 ID, 성공 여부, 신규 구독 여부)
     * @throws InterruptedException 락 획득 대기 중 인터럽트가 발생한 경우
     */
    public StockQuoteSubscriptionResult.Subscription subscribe(String stockCode) throws InterruptedException {
        if (lock.tryLock(5, TimeUnit.SECONDS)) {
            try {
                StockQuoteSubscriptionContext context = getContext(stockCode);
                
                if (context == null) {
                    return new StockQuoteSubscriptionResult.Subscription(null, false, false);
                }
                
                boolean isNewSubscription = isNewSubscription(stockCode);

                if (!context.subscribe(stockCode)) {
                    return new StockQuoteSubscriptionResult.Subscription(context.getSessionId(), false, false);
                }
                
                stockSessionIndex.put(stockCode, context.getSessionId());
                return new StockQuoteSubscriptionResult.Subscription(context.getSessionId(), true, isNewSubscription);
            } finally {
                lock.unlock();
            }
        }

        return new StockQuoteSubscriptionResult.Subscription(null, false, false);
    }

    /**
     * 특정 주식 종목에 대한 구독 해제 메서드
     *
     * 해당 종목을 구독 중인 세션 컨텍서스트에서 구독 횟수를 감소시키고, 횟수가 0이 되면 역인덱스에서도 제거한다.
     *
     * @param stockCode 구독 해제할 주식 종목 코드
     * @return 구독 해제 처리 결과(세션 ID, 성공 여부, 완전 삭제 여부)
     * @throws InterruptedException 락 획득 대기 중 인터럽트가 발생한 경우
     */
    public StockQuoteSubscriptionResult.Unsubscription unsubscribe(String stockCode) throws InterruptedException {
        if (lock.tryLock(5, TimeUnit.SECONDS)) {
            try {
                String sessionId = stockSessionIndex.get(stockCode);

                if (sessionId == null) {
                    return new StockQuoteSubscriptionResult.Unsubscription(null, true, false);
                }

                StockQuoteSubscriptionContext context = subscriptionContextMap.get(sessionId);
                int count = context.unsubscribe(stockCode);
                boolean isDeleted = (count == 0);

                if (isDeleted) {
                    stockSessionIndex.remove(stockCode);
                }

                return new StockQuoteSubscriptionResult.Unsubscription(sessionId, true, isDeleted);
            } finally {
                lock.unlock();
            }
        }

        return new StockQuoteSubscriptionResult.Unsubscription(null, false, false);
    }
    
    /**
     * 해당 주식 종목이 새로 구독을 진행하는 종목인지 여부를 확인하는 메서드
     *
     * 해도 주식 종목 코드가 역인덱스 맵에 존재하는지 여부를 기반으로 판단한다.
     *
     * @param stockCode 확인할 주식 종목 코드
     * @return 신규 구독 대상 여부
     */
    private boolean isNewSubscription(String stockCode) {
        return !stockSessionIndex.containsKey(stockCode);
    }
    
    /**
     * 특정 주식 종목 코드를 구독 중인/구독할 세션 컨텍스트를 조회하는 메서드
     *
     * 이미 구독 중인 종목이면 역인덱스를 통해 해당 세션의 컨텍스트를 반환한다.
     * 신규 종목이면 공정 분배 정책({@link #getFairContext()})에 따라 컨텍스트를 새로 선정한다.
     *
     * @param stockCode 조회할 종목 코드
     * @return 대응하는 구독 컨텍스트 (신규로 배정 가능한 세션이 없으면 {@code null}을 반환)
     */
    private StockQuoteSubscriptionContext getContext(String stockCode) {
        String sessionId = stockSessionIndex.get(stockCode);

        return sessionId == null ? getFairContext() : subscriptionContextMap.get(sessionId);
    }

    /**
     * 공정 분배 정책에 따라 구독 가능한 세션 컨텍스트를 찾는 메서드
     *
     * 라운드로빈 방식으로 정원이 차지 않은 다음 세션의 구독 컨텍스트를 찾는다.
     * 현재 커서 위치({@link #sessionCursor})부터 순회하며 정원이 남은 첫 세션을 반환하고, 다음 호출을 위해 커서를 이동시킨다.
     *
     * @return 구독 가능한 세션 컨텍스트 (세션이 없거나 모든 세션이 가득 찬 경우 {@code null})
     */
    private StockQuoteSubscriptionContext getFairContext() {
        int originalCursor = sessionCursor;

        if (sessionIds.isEmpty()) return null;

        StockQuoteSubscriptionContext context = subscriptionContextMap.get(sessionIds.get(originalCursor));

        // 이 시점에서는 이미 인덱스 내에는 존재하지 않는(기존에 없었다는 이야기)이기 때문에 무조건 41개 다 차있으면 더 이상 못 들어간다.
        while (context.isFull()) {
            sessionCursor = getNextSessionCursor();

            // 원래대로 돌아왔다면 모두 full아리는 것이니 null 리턴
            if (sessionCursor == originalCursor) {
                return null;
            }

            context = subscriptionContextMap.get(sessionIds.get(sessionCursor));
        }

        sessionCursor = getNextSessionCursor(); // 성공 시에도 다음 커서를 가르킬 수 있도록
        return context;
    }

    /**
     * 세션 목록에서 현재 커서의 다음 인덱스를 계산하는 메서드
     *
     * @return 다음 세션 커서 인덱스
     */
    private int getNextSessionCursor() {
        return (sessionCursor + 1) % sessionIds.size();
    }
    
    static class StockQuoteSubscriptionContext {
        private String sessionId;
        private final int capacity;
        private Map<String, Integer> subscriptionMap;

        public StockQuoteSubscriptionContext(String sessionId, int capacity) {
            this.sessionId = sessionId;
            this.capacity = capacity;
            this.subscriptionMap = new HashMap<>(capacity);
        }

        /**
         * 세션 컨텍스트에 주식 종목을 구독하는 메서드
         *
         * 주식 종목에 대한 구독 횟수를 1 증가시킨다.
         * 아직 구독 중이지 않은 종목이면서 정원이 가득 찬 경우에는 더 이상 구독을 진행할 수 없기 때문에 실패한다.
         *
         * @param stockCode 구독할 주식 종목 코드
         * @return 구독 성공 여부
         */
        public boolean subscribe(String stockCode) {
            if (!subscriptionMap.containsKey(stockCode) && subscriptionMap.size() >= capacity) return false;

            subscriptionMap.put(stockCode, subscriptionMap.getOrDefault(stockCode, 0) + 1);
            return true;
        }

        /**
         * 세션 컨텍스트에 주식 종목의 구독을 해제하는 메서드
         *
         * 종목 코드에 대한 구독 횟수를 1 감소시킨다.
         * 감소 후 횟수가 0 이하가 되면 구독 목록에서 완전히 제거한다.
         *
         * @param stockCode 구독 해제할 주식 종목 코드
         * @return 구독 해제후 남은 구독 횟수 ({@code 0}이면 완전히 삭제되었음을 의미)
         */
        public int unsubscribe(String stockCode) {
            Integer count = subscriptionMap.get(stockCode);

            if (count == null) {
                return 0;
            }

            if (count - 1 <= 0) {
                subscriptionMap.remove(stockCode);
                return 0;
            }

            subscriptionMap.put(stockCode, count - 1);
            return count - 1;
        }

        /**
         * 세션 컨텍스트가 담당하는 구독 종목 수가 정원에 도달했는지 확인하는 메서드
         *
         * @return 정원이 가득 찼으면 {@code true}
         */
        public boolean isFull() {
            return subscriptionMap.size() == capacity;
        }
        
        public String getSessionId() {
            return sessionId;
        }
    }
}
```

&nbsp; `StockQuoteSubscriptionRegistry`는 구독을 관리를 전담한다. 

&nbsp; `<sessionId, <stock, stock_subscription_count>>` 상태를 관리하며, 구독 제한량을 초과하지 않는 범위 내에서 구독 요청이 이루어질 수 있도록 상태를 관리한다. 구독·해제 요청은 클라이언트의 동시 요청으로 이루어지기 때문에 `ReentrantLock`을 통하여 임계 영역을 설정하였다. 

&nbsp; `ReentrantLock`이 아닌 Redis 분산락 등의 방법도 고려하였지만, 구독 상태 관리를 서버에서 수행하며 서버가 종료되더라도 재구독 요청은 쉬운 점 등을 고려하여 운영 및 구현 단순성을 기준으로 `ReentrantLock`이 가장 적합하다고 판단하였다. 

```java
public class StockQuoteSubscriptionResult {
    public record Subscription(
            String sessionId,
            boolean isSuccess,
            boolean isNewSubscription
    ) { }
    
    public record Unsubscription(
            String sessionId,
            boolean isSuccess,
            boolean isDeleted
    ) { }
}
```

&nbsp; 구독·해제의 결과는 `StockQuoteSubscriptionResult.Subscription`, `StockQuoteSubscriptionResult.Unsubscription` DTO를 통해 반환한다.

&nbsp; 따라서, `StockQuoteSubscriptionService`는 반환된 결과를 통해 실제 구독·해제 요청을 진행하게 된다.

&nbsp; 이 구조를 개선하는 과정에서 _"application 영역이 웹소켓 세션 id를 알아야한다는 것 자체가, 실시간 체결가(주식 시세)가 웹소켓을 통해 제공된다는 사실이 이미 구조에 스며든 것이 아닌가?"_ 라는 의문이 들기도 했다.

&nbsp; 그러나, 실시간으로 전달되는 체결가 특성상, 웹소켓은 이를 구현하기 위해 반드시 관여할 수 밖에 없는 수단이라고 판단했다. 이런 상황에서 _"application 영역에서 인프라 존재 자체를 완전히 숨겨야한다"_ 는 엄격한 기준을 적용해 웹소켓 세션이라는 개념 자체를 걷어내려 한다면, 오히려 불필요한 추상화 계층이 늘어나 구현 복잡도만 높아진다고 보았다. 따라서, 웹소켓 세션 자체를 application 영역에서 다루는 본래의 결정은 유지하되, 그 세션을 통해서 무엇을 하는지(구독 상태 관리, 실제 요청 전송)의 책임만을 분리하는 방향으로 개선 범위를 정하였다.

### infrastructure 레이어

```java
// muzusi.application.stockquote.port 
public interface StockQuotePort {
    List<String> connect();
    void disconnect();
    void subscribe(String sessionId, String stockCode);
    void unsubscribe(String sessionId, String stockCode);
}
```

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class KisStockQuoteAdapter implements StockQuotePort {
    private final KisWebSocketConnector kisWebSocketConnector;
    private final KisAuthStore kisAuthStore;
    private final KisWebSocketSessionStore kisWebSocketSessionStore;
    private final KisStockQuoteClient kisStockQuoteClient;
    
    /**
     * 한국투자증권 웹소켓 세션을 연결하는 메서드
     *
     * <p> 발급받은 웹소켓 접속키 목록으로 각각 세션을 연결하고, 연결된 세션을 저장소({@link KisWebSocketSessionStore})에 저장
     *
     * @return 연결된 웹소켓 세션 ID 목록
     */
    @Override
    public List<String> connect() {
        List<String> webSocketKeys = kisAuthStore.getWebSocketKeys();
        List<String> connectedSessionIds = new ArrayList<>();
        
        for (String webSocketKey : webSocketKeys) {
            WebSocketSession session = kisWebSocketConnector.connect();
            String connectedSessionId = kisWebSocketSessionStore.save(session, webSocketKey);
            connectedSessionIds.add(connectedSessionId);
        }
        
        return connectedSessionIds;
    }
    
    /**
     * 한국투자증권 웹소켓 세션을 모두 종료하고, 저장소({@link KisWebSocketSessionStore})에서 삭제하는 메서드
     */
    @Override
    public void disconnect() {
        kisWebSocketSessionStore.deleteAll();
    }

    /**
     * 특정 웹소켓 세션을 통해 주식 종목의 실시간 체결가 구독을 요청하는 메서드
     *
     * @param sessionId 구독을 요청할 웹소켓 세션 ID
     * @param stockCode 구독할 주식 종목 코드
     */
    @Override
    public void subscribe(String sessionId, String stockCode) {
        KisWebSocketSessionStore.KisWebSocketSession kisWebSocketSession = kisWebSocketSessionStore.findBySessionId(sessionId);

        if (kisWebSocketSession == null) {
            log.error("[Error] Can not find WebSocketSession to subscribe - {}", sessionId);
            return;
        }

        String webSocketKey = kisWebSocketSession.getWebSocketKey();
        WebSocketSession session = kisWebSocketSession.getWebSocketSession();

        kisStockQuoteClient.subscribe(session, webSocketKey, stockCode);
    }

    /**
     * 특정 웹소켓 세션을 통해 주식 종목의 실시간 체결가 구독 해제를 요청하는 메서드
     *
     * @param sessionId 구독 해제를 요청할 웹소켓 세션 ID
     * @param stockCode 구독 해제할 주식 종목 코드
     */
    @Override
    public void unsubscribe(String sessionId, String stockCode) {
        KisWebSocketSessionStore.KisWebSocketSession kisWebSocketSession = kisWebSocketSessionStore.findBySessionId(sessionId);
        
        if (kisWebSocketSession == null) {
            log.error("[Error] Can not find WebSocketSession to unsubscribe - {}", sessionId);
            return;
        }
        
        String webSocketKey = kisWebSocketSession.getWebSocketKey();
        WebSocketSession session = kisWebSocketSession.getWebSocketSession();
        
        kisStockQuoteClient.unsubscribe(session, webSocketKey, stockCode);
    }
}
```

&nbsp; infrastructure 계층은 `StockQuotePort`의 구현체를 통해 비즈니스 로직이 원하는 요구사항을 외부 인프라와 연동하여 구현한다.

&nbsp; `KisStockQuoteAdapter`는 그 구현체로 한국투자증권 실시간 체결가 웹소켓 구독·해제 요청을 제어한다. 내부에 한국투자증권과 연결된 웹소켓 세션을 관리하는 `KisWebSocketSessionStore`와 한국투자증권 웹소켓 서버에 실시간 체결가 구독·해제 요청을 보내는 `KisStockQuoteClient`를 의존하고 있다.

&nbsp; 유즈케이스에서 구독·해제할 주식 종목과 이를 진행할 웹소켓 세션 id를 전달받아, `KisWebSocketSessionStore`에 저장된 실제 웹소켓 세션을 통해 구독·해제 요청을 진행한다.

### 책임 분리와 인프라 추상화가 가져온 변화

&nbsp; 이번 리팩토링을 통해 `KisSubscriptionManager`가 가지고 있던 책임은 구독 상태를 관리하는 `StockQuoteSubscriptionRegistry`, 한국투자증권과 연결된 웹소켓 세션을 관리하는 `KisWebSocketSessionStore`, 그리고 실제 구독/해제 요청을 인프라에 전달하는 `StockQuotePort` - `StockQuoteAdapter` 구조로 나뉘었다. 각 클래스는 이제 이제 하나의 변경 이유만을 가지게 되었고, application 영역은 더 이상 `KisRealTimeTradeWebSocketClient`와 같은 구체적인 인프라 구현체가 아니라 `StockQuotePort`라는 추상화에만 의존하게 되었따.

&nbsp; 이 구조가 가져오는 이점은 단순히 "코드가 깔끔해졌다"는데 그치지 않는다고 생각한다. 구독 상태 관리 로직과 인프라 연동 로직이 분리되었기 때문에 둘 중 하나만 변경되어도 나머지 코드에 영향을 주지 않고 독립적으로 수정 및 테스트를 진행할 수 있다. 그리고, application 영역이 `StockQuotePort`라는 인터페이스에만 의존하게 됨으로써 향후 실시간 체결가 제공 벤더가 추가되거나 교체되더라도 `KisStockQuoteAdapter`를 다른 어댑터로 교체하는 것만으로 대응할 수 있는 구조가 되었다. 

# \# 결론

&nbsp; 돌이켜보면 이전 리팩토링 작업에서 다중 세션을 도입해 41개였던 구독 가능 종목 수를 82개로 늘렸을 때는, 웹소켓 유량 제한이라는 눈 앞의 제약만 해결하는데 집중했었던 것 같다. 세션을 여러개 운용할 수 있게 만드는 것 자체가 목표였기에, `KisSubscriptionManager`라는 하나의 클래스에 세션 관리와 구독 상태 관리, 실제 인프라 호출까지 모두 담는 구조를 별다른 의심 없이 선택했다.

&nbsp; 문제는 이 구조를 실제로 운영하고 피드백하는 과정에서 드러났다. 이 코드를 다시 들여다볼 때마다 어떤 메서드부터 고쳐야할지 구조를 다시 파악하는데 시간이 걸렸다. 결국 "동작하는 코드"와 "이해하기 쉬운" 코드 사이에는 분명한 차이가 있으며, 후자를 얻기 위해서는 처음부터 책임의 경계를 명확히 그어두는 것이 훨씬 적은 비용이 든다는 점을 깨달았다. 경계와 책임을 명확히하자 클래스의 응집도가 올라고 코드의 가독성도 올라감을 느꼈다.

&nbsp; 이번 작업을 통해 구독 상태 관리, 웹소켓 세션 관리, 인프라 연동이라는 세 가지 책임을 분리하고, Port & Adapter 구조를 도입하면서 처음 설계 단계에서부터 책임과 경계, 변경의 영향을 스스로에게 질문했어야 한다는 것을 다시 한 번 깨달았다. 물론 이번 리팩토링 이후에도 다시 이 작업을 돌이켜보면 개선점이 많이 남았을 것이라고 생각한다. 다만 이번 과정을 통해, 완벽한 설계를 처음부터 예측하기 보다는 지속적인 피드백을 통해 구조를 점진적으로 개선해나가는 것이 더 현실적이고 지속 가능한 방식이라는 확신을 얻을 수 있었다.