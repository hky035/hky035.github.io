---
layout: posts
title:  "WebSocket, STOMP, Redis pub/sub"
author_profile: true
sidbar:
  nav: "main"
category: "web"
description: "본 포스팅은 기존 블로그(https://velog.io/@hky035/websocket)에서 작성된 글입니다."
published: true
show_date: true
---

# 서론

&nbsp; 기존 클라이언트-서버 구조는 단방향 통신의 구조를 가지며, 클라이언트의 일방적인 요청에 대한 서버의 응답으로 통신이 이루어진다. 웹소켓은 HTML5에 도입된 실시간 양방향 통신을 가능하게 하는 TCP 기반 프로토콜이다.


&nbsp; 양방향 통신을 가능하게 하는 기술로는 Polling, Long Polling, SSE(Sever Side Event), WebSocket과 같은 기술이 존재한다. WebSocket을 제외한 나머지 기술들에는 지속적인 연결 불가, 불필요한 확인 메시지 송신, 불완전한 양방향 통신과 같은 한계를 보이며, 이를 극복한 기술이 WebSocket이다.

&nbsp; 필자는 실시간 채팅방, 모의 주식 투자 프로젝트를 진행하며 스프링을 통한 웹소켓 서버 구축 담당의 역할을 맡았다. 해당 포스팅을 통해 기본 웹소켓과 이를 보완한 STOMP, 외부 메시지 브로커를 통한 Pub/Sub 구조에 대해 알아보고자 한다.

# WebSocket



**의존성 추가**
```
implementation 'org.springframework.boot:spring-boot-starter-websocket'
```

## 구조
![](https://velog.velcdn.com/images/hky035/post/5cda867e-d523-4591-ae69-91268cb35a4d/image.png)

&nbsp; 위 그림은 앞으로 구현할 웹 소켓의 구조를 나타낸 것이다.   
&nbsp; 클라이언트와 웹소켓 서버간 연결이 성립되면 **'세션'**이 생성된다.

&nbsp; 즉, 세션은 클라이언트-서버의 커넥션을 나타내며, 해당 세션을 통하여 데이터를 전달한다.

&nbsp; 서버에서는 연결 정보를 저장하기 위해 세션을 List(Set)로 관리한다.
클라이언트 A가 메시지를 보내면, 서버의 세션 리스트에 있는 모든 세션들에게 메시지를 보낸다.

## 구현

&nbsp; 구현은 크게 2가지로 볼 수 있다.

- **WebSocketConfig**: 웹소켓 설정 클래스
- **WebSocketHandler**: 세션 연결/종료, 메시지 전송 등의 기능 클래스

&nbsp; 사용자가 보내는 메시지(payload)는 일반적인 문자열 형태로 전달이 된다. 해당 구현에서는 (1) 메시지를 보낸 사용자와 (2) Json 형태로 보낸 메시지를 받아 변환하기 위한 Chat DTO 클래스도 생성한다.
- **Chat**: 메시지 DTO 클래스(user, message)

### Chat
```java
@Builder
public record Chat(
        String user,
        String message
) {
}
```

### WebSocketConfig
```java
@Configuration
@EnableWebSocket
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketConfigurer {

    private final WebSocketHandler webSocketHandler; // 커스텀 클래스

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(webSocketHandler, "/websocket")
                .setAllowedOrigins("*");
    }
}
```

`WebSocketConfig` 클래스는 웹 소켓 설정 클래스이다.
단순하게 <u>(1) 웹소켓 연결 경로 설정</u>과 <u>(2) 핸들러 설정</u>을 수행한다.

### WebSocketHandler
```java
@Slf4j
@Component
public class WebSocketHandler extends TextWebSocketHandler {

	// 세션 List(Set)
    private static Set<WebSocketSession> sessions = new HashSet<WebSocketSession>(); 
    private final ObjectMapper mapper = new ObjectMapper();

	/* 클라이언트(세션) 연결 시 */
    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        sessions.add(session);
    }

	/* 클라이언트(세션)가 메시지를 송신할 경우 */
    @Override
    public void handleMessage(WebSocketSession session, WebSocketMessage<?> message) throws IOException {

        log.info("payload : {}", message.getPayload());
        Chat chat = mapper.readValue(message.getPayload().toString(), Chat.class);
        log.info("chat : {}", chat);
        log.info("user : {}", chat.user());
        log.info("message : {}", chat.message());


		// 세션 List(Set)에 등록된 모든 세션에들에게 메시지 전달
        sessions.forEach(s -> {
            try{
                s.sendMessage(new TextMessage(chat.user() + ": " + chat.message()));
            }
            catch(IOException e){
                log.error("error : {}", e.getMessage());
            }
        });
    }

	/* 클라이언트(세션) 연결 종료 시 */
    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        sessions.remove(session);
    }
}
```

&nbsp; 다음은 웹소켓의 구체적인 기능을 나타내는 `WebSocketHandler` 클래스이다.   
&nbsp; `TextWebSocketHandler`를 상속받아, 메서드를 오버라이딩하여 기능을 커스텀하여 사용한다.

&nbsp; 클라이언트 연결 시 `Set<WebSocketSession> sessions`에 해당 세션을 추가하며, 연결 종료 시 삭제한다.

&nbsp; 클라이언트가 메시지를 보낼 경우, 해당 메시지 로그를 출력한다.
이후, `Chat` DTO로 값을 매핑한다. 

&nbsp; 변환된 메시지는 `sessions`에 저장된 각 세션에게 `session.sendMessage(new TextMessage(...))` 메서드를 통하여 전달된다.


## 테스트

&nbsp; 테스트 툴은 [SimpleWebSocketClient](https://chromewebstore.google.com/detail/simple-websocket-client/pfdhoblngboilpfeibdedpjgfnlcodoo)를 사용한다.

![image](https://velog.velcdn.com/images/hky035/post/2f30156a-4a6e-4860-8646-4a8282aba6f8/image.png)

&nbsp; 스프링 애플리케이션을 시작 후, WebSocketClient를 통하여 웹소켓 연결을 진행해보자.

![](https://velog.velcdn.com/images/hky035/post/95ce339f-18ae-4cc0-8d71-ea8262370719/image.png)

&nbsp; 위와 같이 웹 소켓 연결 및 메시지 송수신이 정상적으로 진행된 것을 알 수 있다.

## 문제점 및 개선사항

&nbsp; 위의 기본 웹 소켓을 보았을 때 보이는 문제들이 무엇이 있을까?

- 연결된 클라이언트를 세션 리스트로 일일히 관리
- 소켓에 연결된 모든 사용자에게 메세지가 수신
- 메시지가 문자열 형태라 직접 매핑을 진행
- ...

&nbsp; 이와 같이 기본 웹소켓에서는 여러 문제점이 존재하다.


&nbsp; 이를 보완하기 위해 **STOMP(Simple Text Oriented Messaging Protocol)** 프로토콜이 등장하였다.   
STOMP는 pub/sub 구조를 사용하며, STOMP 자체에 대한 설명은 생략한다.



---

> **Notice**   
STOMP와 메세지 브로커, pub/sub 등의 관한 설명은 생략하였기에 해당 부분을 이해한 뒤 다음 내용 보시길 추천합니다.



# STOMP

&nbsp; STOMP는 **메시지 브로커**의 개념을 사용하여, 하나의 메시지 브로커가 하나의 주제(Topic)과 관련된 데이터 송수신을 담당한다. 서버와 연결된 클라이언트들이 특정 주제(Topic)을 구독하여 해당 주제에 대한 데이터만 송수신 할 수 있게 된다.

## 구조
![](https://velog.velcdn.com/images/hky035/post/44b661f2-13c8-494f-bd26-78f9fab19790/image.png)

&nbsp; 우선, 위와 같이 특정 주제(Topic)을 구독(Sub)하는 Client A와 Client B가 있다.

![](https://velog.velcdn.com/images/hky035/post/333f2a70-09b3-47ce-871a-6d2bb87447e4/image.png)

&nbsp; 이 때, Client C가 특정 주제에 대한 메시지를 발행(pub)하게 되면, 해당 주제(Topic)을 구독 중인 Client A, B에게 메시지가 전달되게 된다.   


&nbsp; 이것이 메시지브로커를 통한 pub/sub 구조이다.

## 구현-1

&nbsp; 해당 구현1은 다음과 같은 내용를 가진다.
- pub/sub이 존재
	- Client A: 메시지 수신
	- Cliend B: 메시지 수신
	- Client C: 메시지 송신
    
> 이후 **구현-2**에서는 메시지를 수신하는 Client A, B만 존재하고, 스케줄링을 통해 5초마다 데이터를 전송한다.   
**구현-1**은 클라이언트간 상호작용 흐름(채팅과 같은 기능) 상황이다.   
**구현-2**는 서버 측에서 생산·처리한 데이터를 클라이언트에게 일방적으로 전달하는 상황이다.

&nbsp; 구현 1은 아래와 같은 클래스들을 가진다.

- **WebSocketConfig**: 웹 소켓 연결 경로 및 pub/sub 연결 경로 설정
- **MessageConroller**: pub로 발행한 메시지를 서버 측에서 수신하고, 처리 후 토픽을 sub한 클라이언트에게 메시지를 전달

> **<span style="color:red;">Notice</span>**   
코드를 보기 전에 수신/송신의 주체를 유의하여 봐야한다.   
즉, 서버가 수신/송신하는지, 클라이언트가 수신/송신하는지를 유의하며 읽어야 한다.

### WebSocketConfig
```java
@Configuration
@EnableWebSocketMessageBroker
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/sub"); // 특정 토픽 구독 엔드포인트 접두사 설정
        registry.setApplicationDestinationPrefixes("/pub"); // 메시지 발행 시 엔드포인트 접두사 설정
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/stomp")
                .setAllowedOriginPatterns("*")
                .withSockJS(); // SockJs로 연결 시 http://localhost:8080/stomp로 연결
    }
}
```
 
&nbsp; 위 코드에서는 3개의 엔드포인트를 확인할 수 있다.
- 웹소켓 연결 진행 경로: /stomp
- 특정 토픽 구독 경로: /sub
- 메시지 발행 경로: /pub

&nbsp; "경로는 하나인데 어떻게 여러 토픽을 구독하고, 메시지를 발행하는 게 가능하지?", "해당 경로로 요청은 어떻게 보내는 거지?" 라는 생각이 들 수 있다.
이후 내용에서 모두 설명할 부분이지만, 당장 이해를 하는 것이 도움이 될 것 같다면 <a href="#stomp-test">테스트</a> 부분을 먼저 읽어보자.


### MessageController
```java
@Controller
@RequiredArgsConstructor
@Slf4j
public class MessageController {

    @MessageMapping("{stockId}")	// 앞에 pub 접두사가 자동으로 붙음, 메시지를 발행 pub
    @SendTo("/sub/stocks")			// 특정 토픽을 sub한 클라이언트들에게 전달
    public StockInfo message(@DestinationVariable String stockId) {
        log.info("stock id: {}", stockId);
        return StockInfo.builder()
                .stockId(stockId)
                .price(2000)
                .build();
    }
}

// StockInfo.java
@Builder
public record StockInfo(
        String stockId,
        int price
) {
}
```

&nbsp; 편의를 위하여, 메시지 처리 로직을 Controller 안에서 모두 구현한다.

&nbsp; 사용자가 `/pub/{stockId}` 엔드포인트로 메시지 발행요청을 보내면 `/sub/stocks` 엔드포인트 구독자에게 응답값인 `StockInfo`를 반환한다.

>
**@DestinationVariable**   
>
일반적인 REST API 콘트롤러에서는 `@PathVariable` 어노테이션을 통하여 Path Variable을 전달 받았지만, STOMP 통신에서는 `@DesitnationVariable` 어노테이션을 사용한다.


## <span id="stomp-test">테스트</span>

&nbsp; 테스팅은 [WebSocket Debug Tool](https://jiangxy.github.io/websocket-debug-tool/)을 사용한다.   
&nbsp; 필자는 STOMP 프로토콜을 통한 테스트를 진행하기에, STOMP 옵션 체크 후 `ws://localhost:8080/stomp`로 웹소켓 연결을 진행한다.   
   
&nbsp; SockJS 연결 시에는 `http://localhost:8080/stomp`로 연결을 진행한다.

![](https://velog.velcdn.com/images/hky035/post/74fb84dd-a76d-4084-ac39-843d36a7b1cd/image.png)

&nbsp; 여기서 주목해야 할 필드는 <u>STOMP subscribe destination(sub)</u>과 <u>STOMP send desination(pub)</u>이다.



![](https://velog.velcdn.com/images/hky035/post/0687b093-9087-419b-9205-16883ce29f80/image.png)

![](https://velog.velcdn.com/images/hky035/post/59cda32e-174b-452e-aec0-b46f6542569f/image.png)

![](https://velog.velcdn.com/images/hky035/post/11b8682a-a71b-459b-af79-38c8d456a1ed/image.png)

&nbsp; Client C는 `/pub/apple` 경로로 메시지를 발행한다.   
&nbsp; Client A, B (C 포함)은 `/sub/stocks` 경로를 구독하고 메시지를 해당 경로를 통해 전달받는다.

&nbsp; 또한, `message()` 메서드의 응답값인 `StockInfo`가 전달된 것을 알 수 있다. `StockInfo`의 `stockId`에는 Client C가 보낸 "apple" 데이터가 삽입되었다.

> **_cf**   
**Client가 보낸 pub 요청의 Header 값이나, message(payload)를 사용하려면?**
```java
@MessageMapping("{stockId}")
@SendTo("/sub/stocks")
public StockInfo message(
    DestinationVariable String stockId, 
    @Header("Authorization") String authorizationHeader, // 헤더
    @Payload ReqDto reqDto // 메시지
) {
    log.info("stock id: {}", stockId);
    log.info("Authorization header: {}", authorizationHeader);
>
    return StockInfo.builder()
            .stockId(stockId)
            .price(2000)
            .build();
}
```

## 구현-2

&nbsp; 구현-2는 다음과 같은 내용을 가진다.
- Client A: 메시지 수신
- 서버에서 스케줄링을 통해 5초마다 주식 정보를 송신

### WebSocketConfig
```java
@Configuration
@EnableWebSocketMessageBroker
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {
    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/sub"); // 특정 토픽을 구독하는 경로
        
        /* 클라이언트가 메시지를 발행(pub)하지 않으니 발행 경로 추가 X */
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/stomp")
                .setAllowedOriginPatterns("*")
                .withSockJS();
    }
}
```

&nbsp; 해당 구현에서는 클라이언트가 메시지를 발행(pub)하는 기능은 없다.

### SchedulingConfig

```java
@Configuration
@EnableScheduling // 스케줄링 기능 사용을 위하여 추가
public class SchedulingConfig {
}
```

### MessageSender

```java
@Component
@RequiredArgsConstructor
public class MessageSender {

    private final SimpMessagingTemplate messagingTemplate;

    public void sendMessage() {
        messagingTemplate.convertAndSend("/sub/stocks", getStockInfo("apple", 2000));
    }

    public StockInfo getStockInfo(String stockId, int price) {
        return StockInfo.builder()
                .stockId(stockId)
                .price(price)
                .build();
    }
}
```

&nbsp; `MessageSender` 클래스는 구독자에게 메시지를 보내는 클래스이다.

&nbsp; `sendMessage()` 메서드는
/sub/stocks 경로로 토픽을 구독한 사용자들에게 apple 주식의 정보를 제공한다. 

&nbsp; 앞서 보았던 기본 웹 소켓과 달리 정보 처리 후 `StockInfo` DTO 클래스에 메시지를 담아 전달할 수 있어 조금 더 유연한 로직 구성이 가능하다는 것을 알 수 있다.


&nbsp; `SimpMessagingTemplate` 클래스는 `convertAndSend(D destination, Object payload)` 메서드를 통하여 메시지를 전달한다.

> **Notice**   
`SimpleMessagingTemplate`가 아닌, `SimpMessagingTemplate`이다. 
오탈자를 주의하자.
```java
import org.springframework.messaging.simp.SimpMessagingTemplate;
```

### MessageScheduler
```java
@Component
@RequiredArgsConstructor
@Slf4j
public class MessageScheduler {

    private final MessageSender messageSender;

    @Scheduled(fixedRate = 5000)
    public void scheduleMessage(){
        log.info("Message scheduled");
        messageSender.sendMessage();
    }
}
```

&nbsp; 해당 클래스는 5초(5000ms)마다 `MessageSender.sendMessage()` 메서드를 호출하여 구독자들에게 메시지를 보내는 스케줄링 기능을 담당한다.

&nbsp; 서버 측에서 확인을 위하여 시작 시 로그를 출력한다.

## 테스트

![](https://velog.velcdn.com/images/hky035/post/582ddc9a-8985-4e55-844b-b519c0104ca6/image.png)

&nbsp; 5초마다 스케줄링 되어 메시지가 전달되는 것을 확인할 수 있다.

![](https://velog.velcdn.com/images/hky035/post/40fc4e1e-570a-48ff-b69e-eecb215ac87b/image.png)

&nbsp; 클라이언트 측에서도 5초마다 메시지가 수신된 것을 알 수 있다.

## 문제점

&nbsp; STOMP 구조에도 스프링 애플리케이션 상의 메시지 브로커를 사용하기 때문에 몇 가지 문제점이 존재한다.

- 스프링 애플리케이션 부담 증가
- 스프링 서버가 다운될 경우 메시지 누락

&nbsp; 해당 문제를 해결하기 위해 **외부 메시지큐**를 사용한다.

&nbsp; 외부 메시지큐로는 RabiitMQ, Redis pub/sub, Kafak 등이 존재한다.   
&nbsp; 이 중 **Redis 메시지브로커**를 통하여 프로젝트를 확장시킨다.


---

# Redis pub/sub

&nbsp; 우선, 순수 Redis 상에서 pub/sub에 대해 알아보자.

![](https://velog.velcdn.com/images/hky035/post/31f7e888-7fd5-4963-af5e-1717a2a2dd3a/image.png)

&nbsp; 위 그림 하나면 충분히 이해에 도움이 될 것이라 생각한다.

(1) Client A에서는 "test-channel"이라는 **채널**을 구독(sub)한다.
```bash
> subscribe 채널이름 # 특정 채널 구독
```
(2) Client B에서는 "test-channel" 채널로, 메시지를 발행(pub)한다.
```bash
> publish 채널이름 메시지내용	# 특정 채널 구독
```
(3) 이후, Client A에서는 Client B가 보낸 메시지가 수신된 것을 알 수 있다.

&nbsp; 여기서 중요한 것이 **채널**이라는 개념이다.   
&nbsp; STOMP 에서 언급한 **주제(Topic)**와 동일 선상에서 보면 된다.

&nbsp; 구조를 그림으로 이해해보자.

## 구조

![](https://velog.velcdn.com/images/hky035/post/dbd76205-5db3-4209-89a7-0abd61855704/image.png)

## 구현 전 준비

&nbsp; 본 테스트에서는
- 클라이언트 간 채팅 Topic
- 서버에서 클라이언트에게 전달하는 주식 Topic

이 존재한다.

## Redis 기본 설정

### 의존성 추가
```java
implementation 'org.springframework.boot:spring-boot-starter-data-redis'
```

## applicaiton.yml

```yml
--- #redis
spring:
  data:
    redis:
      host: 127.0.0.1
      port: 6379
```

### RedisConfig
```java
@Configuration
@RequiredArgsConstructor
public class RedisConfig {

    @Value("${spring.data.redis.host}")
    private String host;
    @Value("${spring.data.redis.port}")
    private int port;

    @Bean
    public RedisConnectionFactory redisConnectionFactory() {
        RedisStandaloneConfiguration redisStandaloneConfiguration = new RedisStandaloneConfiguration(host, port);

        return new LettuceConnectionFactory(redisStandaloneConfiguration);
    }

    @Bean
    public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory redisConnectionFactory) {

        RedisTemplate<String, Object> redisTemplate = new RedisTemplate<>();
        redisTemplate.setConnectionFactory(redisConnectionFactory);
        redisTemplate.setKeySerializer(new StringRedisSerializer());
        redisTemplate.setValueSerializer(new GenericJackson2JsonRedisSerializer());
        redisTemplate.setValueSerializer(new Jackson2JsonRedisSerializer(ChatInfo.class)); // ❗ 이후 설명
        redisTemplate.setValueSerializer(new Jackson2JsonRedisSerializer(StockInfo.class)); // ❗ 이후 설명
        redisTemplate.setHashKeySerializer(new StringRedisSerializer());
        redisTemplate.setHashValueSerializer(new GenericJackson2JsonRedisSerializer());

        return redisTemplate;
    }

	/* MessageListener와 각 Topic들을 연결하는 설정을 가지는 Container Bean 등록 */
    @Bean
    public RedisMessageListenerContainer redisMessageListenerContainer(
            MessageListenerAdapter stockListener,
            MessageListenerAdapter chatListener,
            ChannelTopic stockTopic,
            ChannelTopic chatTopic
    ) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(redisConnectionFactory());
        
        // 주식 MessageListener와 주식 Topic을 연결
        container.addMessageListener(stockListener, stockTopic); 
        
        // 채팅 MessageListener와 주식 Topic을 연결
        container.addMessageListener(chatListener, chatTopic);
        
        return container;
    }

    /* 주식 메시지 브로커에서 보낸 메시지를 수신하기 위한 Adapter Bean 등록 */
    @Bean(name = "stockListener")
    public MessageListenerAdapter listenerAdapter(StockSubscriber subscriber) {
        return new MessageListenerAdapter(subscriber, "onMessage");
        // 두 번째 인자 = 레디스에서 보낸 메시지를 받아 처리할 메서드 이름 = "onMessage" 
    }

	/* 채팅 메시지 브로커에서 보낸 메시지를 수신하기 위한 Adapter Bean 등록 */
    @Bean(name = "chatListener")
    public MessageListenerAdapter chatListenrAdapter(ChatSubscriber subscriber) {
        return new MessageListenerAdapter(subscriber, "onMessage"); 
        // 두 번째 인자 = 레디스에서 보낸 메시지를 받아 처리할 메서드 이름 = "onMessage" 
    }

    /* 채널 주제 등록 - 주식 */
    @Bean(name = "stockTopic")
    public ChannelTopic stockTopic() {
        return new ChannelTopic("stock");
    }

	/* 채널 주제 등록 - 채팅 */
    @Bean(name = "chatTopic")
    public ChannelTopic chatTopic() {
        return new ChannelTopic("chat");
    }
}
```

&nbsp; 스프링 애플리케이션을 시작한 뒤, Redis-cli를 통해 채널을 확인해보자.

```bash
> pubsub channels  # 현재 개설된 채널 토픽을 확인
```
![](https://velog.velcdn.com/images/hky035/post/7b9dffcf-1ac6-47fb-a974-b4ba9dc8710a/image.png)


> 스프링 애플리케이션을 종료하면? 당연히 empty list가 출력된다.
>
![](https://velog.velcdn.com/images/hky035/post/e7cf15a1-66ea-4420-8308-8e4e7b327f0a/image.png)


## 구현-1

&nbsp; Redis pub/sub에서도 동일하게 구현-1과 구현-2로 나누어 구현한다.
- 구현 1: 클라이언트의 메시지 발행(pub) + 클라이언트의 메시지 수신(sub)
- 구현 2: 서버 측에서 주식 정보를 클라이언트에게 전송(pub)

### WebSocketConfig
```java
@Configuration
@EnableWebSocketMessageBroker
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {
    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/sub"); // 특정 토픽을 구독
        registry.setApplicationDestinationPrefixes("/pub");  // 메시지를 발행
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/stomp")
                .setAllowedOriginPatterns("*")
                .withSockJS();
    }
}
```

&nbsp; 웹 소켓 설정 클래스인 `WebSocketConfig`는 앞서 보았던 코드와 다른 점이 없다.

### ChatInfo
```java
@Builder
public record ChatInfo(
        String user,
        String message
){
}
```

&nbsp; 메시지를 보낸 클라이언트(user)와 내용(message)를 받는 DTO 클래스이다.

### ChatPublisher
```java
@RestController
@RequiredArgsConstructor
@Slf4j
public class ChatPublisher {

    private final RedisTemplate redisTemplate;

    @MessageMapping("chat")
    public void pubChat(ChatInfo chatInfo) {
        log.info("pub message: {}", chatInfo.toString());

        redisTemplate.convertAndSend("chat", chatInfo);
    }
}
```

&nbsp; `ChatPublisher`는 사용자로부터 메시지를 받아 Redis 메시지브로커로 메시지를 전달(발행)한다.   
&nbsp; 이 때, ChannelTopic은 앞서 설정하였던 "chat" 채널로 전달한다.

![](https://velog.velcdn.com/images/hky035/post/b349a1a1-d733-469e-afec-cff0815d89a4/image.png)

&nbsp; 현재까지의 코드는 위 과정을 나타낸다.


### ChatSubscriber
```java
@Component
@Slf4j
@RequiredArgsConstructor
public class ChatSubscriber implements MessageListener {

    private final ObjectMapper mapper = new ObjectMapper();
    private final RedisTemplate redisTemplate;
    private final SimpMessageSendingOperations simpMessageSendingOperations;

    @Override
    public void onMessage(Message message, byte[] pattern) {
        try {
        
          String listenedMessage = (String) redisTemplate.getStringSerializer().deserialize(message.getBody());

          log.info("listened message: {}", listenedMessage);
          ChatInfo chatInfo = mapper.readValue(listenedMessage, ChatInfo.class);

          simpMessageSendingOperations.convertAndSend("/sub/chat", chatInfo);
        
        } catch (JsonProcessingException e) {
            log.error("error: {}", e.getMessage());
        }

    }
}
```

&nbsp; `ChatSubscriber`는 `MessageListener`를 구현한 커스텀 클래스로, 레디스 메시지브로커의 특정 채널에서 오는 메시지를 받아 처리하는 클래스이다. `RedisConfig` 클래스에서 **Chat** 채널토픽과 ChatSubscriber의 연결을 진행하였다.

&nbsp; 레디스에서 보낸 메시지는 `Message message` 인자로 전달받는다. 이 메시지를 역직렬화하여 해당 값을 문자열로 받아온다. 해당 문자열을 ObjectMapper를 통해 `ChatInfo.class`로 변환한다.   

&nbsp; 이후, `SimpMessageSendingOperation.convertAndSend("/sub/chat", chatInfo)` 명령어를 통해 /sub/chat 경로의 구독자들에게 메시지를 전송한다.

> **SimpMessageSendingOperation**   
>
앞서 보았던 `SimpMessagingTemplate`의 구현체가 `SimpMessageSendingOperation`이다.   
>
`@EnableWebSocketMessageBrocker` 설정 시 자동으로 `SimpMessagingTemplate`의 구현체 중 하나가 Bean으로 등록된다. 따라서, 해당 필드를 `SimpMessagingTemplate`으로 바꾸어도 무방하다.

![](https://velog.velcdn.com/images/hky035/post/2a2579cb-0d85-466d-8c23-1877c7e9d167/image.png)

&nbsp; 위 코드는 다음 상황을 나타낸다.

## 테스트

&nbsp; 테스트는 WebSocketDebug Tool과 Redis 상에서 메시지가 송수신되는 것을 확인한다.

![](https://velog.velcdn.com/images/hky035/post/4eebcafe-62a6-4a92-b490-5886234652c3/image.png)

![](https://velog.velcdn.com/images/hky035/post/47971cb8-fb05-4033-a08a-2774ea80783e/image.png)

위와 같이 정상적으로 메시지가 송수신되는 것을 알 수 있다.

그렇다면 레디스 상에서 메시지를 수신해보자.

![](https://velog.velcdn.com/images/hky035/post/2947f88d-4670-460a-b2b5-acd2e22fac8a/image.png)

```bash
> subscribe 채널명   # 특정 채널 구독
```

`subscribe chat`을 통해 "chat" 채널을 구독한다.
이후, 메시지가 잘 수신되는 것을 확인할 수 있다.

---
그렇다면, Redis 상에서 메시지를 발행해보자.

![](https://velog.velcdn.com/images/hky035/post/497232b9-9967-496c-a51a-6f5de7285140/image.png)

```bash
> publish 채널 메시지내용  # 특정 채널로 메시지 전송
```

`publish chat '{"user":"park","message":"hi there"}'` 명령어를 통하여 "chat" 채널의 구독자들에게 메시지를 송신한다.

![](https://velog.velcdn.com/images/hky035/post/fa773440-ae25-4035-9080-69d8f926cc4d/image.png)

&nbsp; 레디스 메시지 브로커는 "chat" 채널을 구독하고 있는 모든 구독자들에게 메시지를 전달하게 된다.   

&nbsp; 따라서, 스프링을 거쳐 "chat" 채널과 연결된 `MessageListener(=ChatSubscriber)`에게 메시지가 전달되고, `onMessage(...)` 메서드 내에서 /sub/chat을 구독하고 있는 클라이언트에게 메시지가 전송된 것을 확인할 수 있다.

## 트러블 슈팅

![](https://velog.velcdn.com/images/hky035/post/b7e7f102-b1ed-4a02-ad34-f4066b972414/image.png)
```
2024-12-20T15:13:54.952+09:00  INFO 26588 --- [nboundChannel-4] com.example.stomp.redis.ChatPublisher    : pub message: ChatInfo[user=kim, message=hi there]
2024-12-20T15:13:54.976+09:00  INFO 26588 --- [enerContainer-1] com.example.stomp.redis.ChatSubscriber   : listened message: {"@class":"com.example.stomp.redis.ChatInfo","user":"kim","message":"hi there"}
2024-12-20T15:13:54.981+09:00 ERROR 26588 --- [enerContainer-1] com.example.stomp.redis.ChatSubscriber   : error: Unrecognized field "@class" (class com.example.stomp.redis.ChatInfo), not marked as ignorable (2 known properties: "user", "message"])
 at [Source: REDACTED (`StreamReadFeature.INCLUDE_SOURCE_IN_LOCATION` disabled); line: 1, column: 80] (through reference chain: com.example.stomp.redis.ChatInfo["@class"])
```

&nbsp; 초기에 채팅 메시지를 발행(pub) 했을 때 위와 같은 오류가 발생하며 메시지가 제대로 전달되지를 않았다.

&nbsp; 해당 에러는 `@class` 필드를 매핑하지 못한다는 내용인데, 자세히 확인하기 위해 레디스 상에서 chat 채널을 구독하여 확인해보았다.

![](https://velog.velcdn.com/images/hky035/post/cb19968c-3173-4011-aa76-d2027b995361/image.png)

&nbsp; 확인 결과,  해당 객체에 `@class` 필드가 들어가있는 것을 확인하였다.   
넣은 적이 없는 필드가 있어 굉장히 당황하였다.

&nbsp; 결론부터 말하자면 이는 **직렬화** 과정 시 문제가 발생하는 것이다.
에러 로그를 확인하였을 때 `RedisTemplate`를 통해 Redis 상으로 메시지를 전달하는 것 까지는 문제가 없었으나, 메시지브로커를 통해 메시지를 수신받을 때 에러가 발생하였다.

&nbsp; 즉, `RedisTemplate`를 통해 `chatInfo` 메시지를 보낼 때, 직렬화 과정에서 해당 클래스를 나타내는 `@class` 필드가 추가되어 전달되는 것이다. 이는 Redis 직렬화 설정에 따라 다르다.

&nbsp; 이 문제를 해결하는 방법은 대략 2가지 정도가 있다.
- DTO 클래스에 `@JsonTypeInfo(use = JsonTypeInfo.Id.NONE)` 어노테이션 추가
- `RedisTemplate` 빈 등록 시 DTO 클래스 직렬화 Serializer 등록

&nbsp; 필자는 후자를 선택하여 해결하였다. 
따라서, `RedisTemplate` Bean 등록 시 `ChatInfo` 클래스에대한 Serializer도 등록해주었다.

```java
// RedisConfig.java
@Bean
public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory redisConnectionFactory) {

	RedisTemplate<String, Object> redisTemplate = new RedisTemplate<>();
    redisTemplate.setConnectionFactory(redisConnectionFactory);
    redisTemplate.setKeySerializer(new StringRedisSerializer());
    redisTemplate.setValueSerializer(new GenericJackson2JsonRedisSerializer());
    
    // ChatInfo.class에 관한 Serializer 추가
	redisTemplate.setValueSerializer(new Jackson2JsonRedisSerializer(ChatInfo.class));
    redisTemplate.setValueSerializer(new Jackson2JsonRedisSerializer(StockInfo.class));
    
    redisTemplate.setHashKeySerializer(new StringRedisSerializer());
    redisTemplate.setHashValueSerializer(new GenericJackson2JsonRedisSerializer());

    return redisTemplate;
}
```

&nbsp; 해당 문제에 관해 간략히 설명하자면 다음과 같다.

&nbsp; 원래 등록해놓은 ValueSerializer는 `GenericJackson2JsonRedisSerializer`이다.   
&nbsp; `GenericJackson2JsonRedisSerializer`는 객체의 클래스 지정없이 모든 Class Type을 JSON 형태로 저장할 수 있는 Serializer이다. 따라서, 간단하게 사용하기는 아주 좋다.   

&nbsp; 그러나, 모든 클래스를 저장할 수 있기 때문에 저장 시에 객체의 Class 및 Package까지 같이 저장을 하게 되어 redis에 저장되어 있는 값을 사용하려면 패키지까지 일치시켜 줘야한다고 한다.

&nbsp; 그렇기 때문에 `@class` 필드가 추가되어 저장된 것이다.

<br/>

&nbsp; 또 다른 Serializer로는 `Jackson2JsonRedisSerializer` 가 있다.   
`Jackson2JsonRedisSerializer`는 일일히 클래스 타입을 지정해주기 때문에 객체 저장 시에 특정 패키지 정보 일치 고려없이 Class Type만 저장 가능하다.


[Redis 직렬화](https://velog.io/@bagt/Redis-%EC%97%AD%EC%A7%81%EB%A0%AC%ED%99%94-%EC%82%BD%EC%A7%88%EA%B8%B0-feat.-RedisSerializer)를 잘 정리해놓은 블로그가 존재한다.

----

## 구현-2

&nbsp; 구현-2는 서버에서 주식 정보를 발행하여 일방적으로 클라이언트에게 정보를 전달하는 과정이다.

**WebSocketConfig**는 동일하다.

### StockPublisher
```java
@RequiredArgsConstructor
@Slf4j
@Component
public class StockPublisher {

    private final RedisTemplate redisTemplate;

    @Scheduled(fixedRate = 5000)
    public void publishStock() {
        log.info("pub stock");
        redisTemplate.convertAndSend("stock", getStockInfo());
    }

    private StockInfo getStockInfo(){
        return StockInfo.builder()
                .stockId("apple")
                .price(2000)
                .build();
    }
}
```

&nbsp; `StockPulisher`는 5초마다 Redis의 "stock" 채널으로 주식 정보를 발행(pub)한다.


### StockSubscriber

```java
@Component
@Slf4j
@RequiredArgsConstructor
public class StockSubscriber implements MessageListener {

    private final ObjectMapper mapper = new ObjectMapper();
    private final RedisTemplate redisTemplate;
    private final SimpMessageSendingOperations simpMessageSendingOperations;

    @Override
    public void onMessage(Message message, byte[] pattern) {
        String listenedMessage = (String) redisTemplate.getStringSerializer().deserialize(message.getBody());

        log.info("listened message: {}", listenedMessage);

        try {
            StockInfo stockInfo = mapper.readValue(listenedMessage, StockInfo.class);

            simpMessageSendingOperations.convertAndSend("/sub/stocks", stockInfo);
        } catch (JsonProcessingException e) {
            log.error("error: {}", e.getMessage());
        }
    }
}
```

&nbsp; `StockSubscriber`는 Redis 메시지 브로커에게 메시지를 받은 뒤 /sub/stocks 구독자에게 메시지를 전송한다.

## 테스트

![](https://velog.velcdn.com/images/hky035/post/9ba55517-93bc-4b62-921a-a1f51c55263b/image.png)

![](https://velog.velcdn.com/images/hky035/post/3311f120-3e52-422d-a0e6-a8f2f0a8d644/image.png)

&nbsp; 위와 같이 메시지가 잘 수신된 것을 알 수 있다.


---

# 프론트엔드 단에서 소켓 연결

&nbsp; 그럼 프론트엔드 단에서는 어떻게 소켓 연결을 진행하고, 메시지를 발행하고, 구독할 수 있을까.

&nbsp; 이는 간단하게 코드로 준비하였다.
&nbsp; 단지, 이해를 돕기 위한 코드임을 참고하길 바란다.

```js
import React, { useEffect, useState } from 'react';
import { Stomp } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

const ChatComponent = () => {
    const [messages, setMessages] = useState([]);
    const [stompClient, setStompClient] = useState(null);
    const [messageInput, setMessageInput] = useState('');

    useEffect(() => {
        const socket = new SockJS('http://localhost:8080/stomp');
        const client = Stomp.over(socket);

        client.connect({}, (frame) => {
            console.log('Connected: ' + frame);

            // 메시지 구독
            client.subscribe('/sub/chat', (message) => {
                if (message.body) {
                    setMessages((prevMessages) => [...prevMessages, message.body]);
                }
            });

            setStompClient(client);
        });

        // 컴포넌트 언마운트 시 연결 해제
        return () => {
            if (client) {
                client.disconnect();
            }
        };
    }, []);

    const sendMessage = () => {
        if (stompClient && messageInput) {
            stompClient.send('/pub/chat', {}, messageInput); // 메시지 발행
            setMessageInput('');
        }
    };

    return (
        <div>
            <div>
                <h2>Chat Messages</h2>
                <ul>
                    {messages.map((msg, index) => (
                        <li key={index}>{msg}</li>
                    ))}
                </ul>
            </div>
            <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                placeholder="메시지를 입력하세요"
            />
            <button onClick={sendMessage}>전송</button>
        </div>
    );
};

export default ChatComponent;
```


# 결론 및 후기

&nbsp; 필자는 서버에서 클라이언트로 일방적으로 정보를 전달하는 웹 소켓 구현을 목표로 하고있었다.

&nbsp; 따라서, 일반적으로 채팅과 관련된 자료들만 많기때문에 초기 구조부터 생각하는 부분에 있어 어려움이 있었다.   
&nbsp; 웹 소켓은 동작의 흐름을 이해하면 굉장히 쉬운 구조이다.

&nbsp; 혹여나, 웹 소켓 관련하여 헤매고 있는 이가 있다면 해당 포스팅이 도움이 되었으면 한다.

&nbsp; 이후, 추가적으로 **구독 취소** 등에 관한 추가적인 사항을 알아볼 계획이다.

