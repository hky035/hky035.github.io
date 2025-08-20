---
layout: posts
title:  "쓰로틀링을 통한 한국투자증권 API 호출 유량 제한 정책 대응 및 성능 개선"
author_profile: true
sidbar:
  nav: "main"
category: "web"
description: "이전에 진행했던 주식 투자 웹 서비스 프로젝트 '무주시'를 리팩토링하며 예전에 작성하였던 코드들을 다시 되돌아보고 있다. '무주시'는 한국투자증권 API를 사용하여 주식 관련 정보를 받아온다. 그 중 주식 분봉 데이터를 받아오는 과정에서 성능적인 문제점이 존재하였고, 최근 서버에서 쓰로틀링(Throttling)을 통한 API 호출 유량 제한 관련 포스팅들을 읽고 API 호출 유량 제한 정책을 두고있는 한국투자증권 API에 대응하는 용도로 무주시의 서버에 쓰로틀링을 적용하여 외부 API를 호출하면 이러한 문제를 해결할 수 있을 것이라 생각하였다. 해당 포스팅에서는 쓰로틀링 및 기타 리팩토링을 통한 성능 개선의 경험을 풀어보고자 한다."
published: true
show_date: true
---

# 서론 - Problem

&nbsp; 최근 주식 투자 웹 서비스 프로젝트 '무주시'를 리팩토링하며 예전에 작성하였던 코드들을 다시 되돌아보고 있다. 당시 작성했던 코드들을 보고 "왜 이렇게 작성하였지"라는 한탄을 하기도 하지만, 또한 그만큼 문제를 해결하는 능력이 늘어났다는 긍적적인 생각으로 리팩토링을 진행하고 있다. 

&nbsp; '무주시'는 한국투자증권 API를 사용하여 주식 관련 정보를 받아온다. 그 중 한국 주식 시장이 열린 시간 내 매 10분마다 [주식 당일 분봉 조회 API](https://apiportal.koreainvestment.com/apiservice-apiservice?/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice)를 호출하여 주식 분봉 차트 정보와 현재가를 별도로 추출하여 저장한다. 

&nbsp; 현재 서비스에서 제공되는 주식 종목은 총 2,742개이다. 

&nbsp; 또한, 주식 당일 분봉 조회 API는 주식 종목 코드를 기반으로 특정 주식의 분봉 데이터를 반환하기 때문에 2,742개의 주식에 대해 별도로 API를 호출해야한다. 즉, 2,742번의 주식 당일 분봉 조회 API를 호출해야하는 것이다.

&nbsp; 한국투자증권에서는 API 호출 유량을 초당 20개로 제한하고 있다. 원래도 외부 API를 호출하고 이를 처리하는 과정이 매우 비용이 큰 작업일 것이라 생각했지만, 당시에는 마땅한 해결 방법을 찾지 못하여 우선은 아래와 같이 `count` 변수를 증가시켜 15번의 호출마다 1초씩 Thread를 멈추는 식으로 설계를 하였다.

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class KisStockChartUpdater {
    private final StockCodeProvider stockCodeProvider;
    private final KisStockClient kisStockClient;
    private final StockMinutesService stockMinutesService;
    private final StockPriceService stockPriceService;
    private static final int BATCH_SIZE = 500;

    /**
     * 한국투자증권 주식 분봉데이터 호출 및 저장 메서드.
     * - 주식 분봉 데이터 저장(캐싱)
     * - 주식 분봉 데이터를 주식 현재가 정보로 파싱해 저장(캐싱)
     *
     * REST API 호출 유량 제한으로 인하여 초당 15개 단위 주식 데이터 호출 제한
     */
    public void saveStockMinutesChartAndInquirePrice() throws InterruptedException {
        int count = 0;
        Map<String, StockChartInfoDto> stockChartInfoMap = new HashMap<>(BATCH_SIZE);
        LocalDateTime now = LocalDateTime.now();

        for (String code : stockCodeProvider.getAllStockCodes()) {
            if (++count % 15 == 0) { // 15번의 호출마다 1초간 Thread Sleep
                Thread.sleep(1000L);
            }
            StockChartInfoDto stockChartInfo = kisStockClient.getStockMinutesChartInfo(code, now);
            stockChartInfoMap.put(code, stockChartInfo);

            if (count == BATCH_SIZE) {
                stockMinutesService.saveAllInCache(stockChartInfoMap.values());
                stockPriceService.saveAllInCache(convertToStockPriceMap(stockChartInfoMap));
                stockChartInfoMap.clear();
                count = 0;
            }
        }

        if (!stockChartInfoMap.isEmpty()) {
            stockMinutesService.saveAllInCache(stockChartInfoMap.values());
            stockPriceService.saveAllInCache(convertToStockPriceMap(stockChartInfoMap));
        }
    }
    
    /**
     * 주식 분봉 차트 Map 데이터를 주식 현재가 Map 데이터로 변환하는 메서드
     *
     * @param stockChartInfoMap 주식 종목 코드를 Key, 주식 분봉 차트 정보를 Value로 가지는 Map
     * @return                  주식 종목 코드를 Key, 주식 현재가 정보를 Value로 가지는 Map
     */
    private Map<String, Object> convertToStockPriceMap(Map<String, StockChartInfoDto> stockChartInfoMap) {
        return stockChartInfoMap.entrySet().stream()
                .map(entry -> Map.entry(entry.getKey(), entry.getValue().toStockPrice()))
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }
}
```
<div style="text-align: center">
    <img src="/assets/img/docs/web/kis-api-throttling/thread-sleep-result.png" alt="thread-sleep-result" />
</div>


&nbsp; `Thread.sleep(1000L)` 방식으로 실행시킨 결과, 주식 분봉 데이터 API를 호출하고 이를 모두 저장하는데까지 걸린 시간은 7분 12초(432초)이다. 주식 분봉 데이터를 10분 주기로 받아오는데, 저장에는 7분이 걸린다는 것은 굉장히 비효율적이다.

&nbsp; 처음에는 이 문제가 단순히 API 호출에 걸리는 시간이 느리기 때문에 발생한다고 생각했었다. 그러나, 15번의 요청을 보내고 1초를 쉬는 현재 로직을 잘 생각해보니 해당 메서드에서 병목이 발생하는 이유를 알 수 있었다.

![thread-sleep-diagram](/assets/img/docs/web/kis-api-throttling/thread-sleep-diagram.png)

&nbsp; 현재 주식 분봉 데이터를 호출하는 로직을 모식화하면 위 그림과 같다. 

&nbsp; 15번의 한국투자증권 API 호출 후 1초씩 쉬게 되면서 idle한 시간이 각 요청 사이에 생기게 된다. 이는 API 호출의 안전성은 보장이 되는 방법이다. 호출 유량을 초과하지 않는 확실한 방법이지만 idle한 시간을 계산해보면 아래와 같다.

&nbsp; 우선, 2742 / 15 = 182.8이다. 즉, 각 15번의 요청 묶음 사이에 <u>181번의 idle한 시간이 생기게 되는 것</u>이다. 

&nbsp; 181 * 1초 = 181초 = 약 3분 이다. 즉, idle한 시간만 계산해도 약 3분이라는 시간이 소모되는 것이다.

&nbsp; 15번의 API를 요청하는 시간이 1초 이상이라 가정하면 `181 + 182 * (1 + @)  = 약 7분` 정도의 시간이 소요된 것이다. 

&nbsp; 필자는 프로젝트를 리팩토링하면서 잘못된 알고리즘 설계로 인한 병목 현상을 해결하고자 하였다. 따라서, <span style="font-style: italic;">"한국투자증권 API 호출 유량 정책에 맞게 1초 내에 보내는 요청의 갯수를 조절하는 방법은 없을까?"</span>는 생각으로 이 문제에 대해 찾아보기 시작하였다.

&nbsp; 그러던 중, 호출 유량 제한과 관련되어서 <span style="font-weight: bold;">쓰로틀링(Throttling)</span>이라는 기술이 사용된다는 것을 알게되었다.

## 쓰로틀링 Throttling

&nbsp; 원래 'Throttle'이라는 단어는 유체의 흐름을 조절하는 장치라 한다. 이를 기계나 소프트웨어 대입해본다면 성능을 위해 흐름을 제어하는 것을 의미한다는 것을 알 수 있다.

&nbsp; API와 관련된 쓰로틀링은 <span style="font-weight: bold">API 쓰로틀링</span>이라 부른다. 

&nbsp; API 쓰로틀링은 다음과 같은 이유로 사용을 한다.

- 클라이언트 → 서버 호출 유량 제한
    - 서버에서 외부 API를 사용하는 경우, 클라이언트가 해당 기능에 대한 무분별한 요청을 보낸다면 비용 문제 발생 가능
- Dos 공격 방어
- 외부 API 서버 자체에 호출 유량 제한이 있는 경우

&nbsp; 현재 상황은 '외부 API 서버 자체에 호출 유량 제한이 있는 경우'이기 때문에 외부 API 서버(한국투자증권)에 요청을 보내는 무주시의 서버에서 쓰로틀링을 적용하여 한국투자증권 API 호출 유량 제한 정책에 대응하고자 한다.

&nbsp; 쓰로틀링은 TokenBucket, Fixed Window Counter, Sliding Window log 등 다양한 방법이 있지만 현재 포스팅에서는 생략하며, 한국투자증권은 1초에 20번의 API 호출 유량 제한을 하고 있다는 사실에 집중하여 이를 해결하고자 한다.

&nbsp; 또한, 쓰로틀링과 유사한 <span style="font-weight: bold;">비율 제한(Rate Limit)</span>이라는 개념이 있다. 거의 유사한 개념으로 세부적인 설명에 대한 차이는 존재하지만 혼용해서 사용하는 듯하다.

## 기타 문제점 Additional Issue

&nbsp; 해당 포스팅은 쓰로틀링을 통한 외부 API 호출 시 idle한 시간 해결에 중점이 맞추어져 있지만, 해당 로직에서 몇 가지 다른 문제점도 발견하였다.

- <span style="font-family: Noto Sans KR">모든 반복마다 한국투자증권 API 요청을 위한 Redis 내 AccessToken 조회 로직</span>
- <span style="font-family: Noto Sans KR">호출 유량 제한 발생 시 예외 처리</span>
- <span style="font-family: Noto Sans KR">주식 분봉 데이터 Map 저장 시 코드 별 저장</span>

&nbsp; 위와 같은 부가적인 문제들이 존재한다. 현재 포스팅에서는 <u>한국투자증권 AccessToken 조회 로직</u>과 <u>호출 유량 발생시 예외 처리</u>를 해결하는 내용을 추가적으로 담고자 한다. 주식 분봉 데이터 Map 저장 문제에서는 Redis Pipeline을 사용하였는데 성능상 큰 개선점을 발견하지 못하여 이후 테스트를 더욱 진행한 다음 적용하고자 한다.

<h3 id="problem-at">1. 모든 반복마다 Redis 내 AccessToken 조회 로직</h3>

```java
public void saveStockMinutesChartAndInquirePrice() throws InterruptedException {
    int count = 0;
    Map<String, StockChartInfoDto> stockChartInfoMap = new HashMap<>(BATCH_SIZE);
    LocalDateTime now = LocalDateTime.now();

    for (String code : stockCodeProvider.getAllStockCodes()) {
        if (++count % 15 == 0) { 
            Thread.sleep(1000L);
        }
        // 매 반복마다 한국투자증권 주식 분봉 데이터 API 호출
        StockChartInfoDto stockChartInfo = kisStockClient.getStockMinutesChartInfo(code, now);
        stockChartInfoMap.put(code, stockChartInfo);

        if (count == BATCH_SIZE) {
            stockMinutesService.saveAllInCache(stockChartInfoMap.values());
            stockPriceService.saveAllInCache(convertToStockPriceMap(stockChartInfoMap));
            stockChartInfoMap.clear();
            count = 0;
        }
    }

    if (!stockChartInfoMap.isEmpty()) {
        stockMinutesService.saveAllInCache(stockChartInfoMap.values());
        stockPriceService.saveAllInCache(convertToStockPriceMap(stockChartInfoMap));
    }
}
```

```java
@Component
@RequiredArgsConstructor
public class KisStockClient {
    private final KisRequestFactory kisRequestFactory;

    public StockChartInfoDto getStockMinutesChartInfo(String code, LocalDateTime time) {

        HttpHeaders headers = kisRequestFactory.getHttpHeader(MINUTES_CHART_TR_ID);

        /* ... */
    }

    /* ... */
}
```

```java
@Component
@RequiredArgsConstructor
public class KisRequestFactory {
    private final KisAuthService kisAuthService;
    private final KisProperties kisProperties;

    public HttpHeaders getHttpHeader(String trId) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
`
        // getHttpHeader(...)를 호출할 때마다 레디스 내에서 한국투자증권 액세스 토큰을 조회
        headers.add("authorization", kisAuthService.getAccessToken()); 
        headers.add("appkey", kisProperties.getAppKey());
        headers.add("appsecret", kisProperties.getAppSecret());
        headers.add("tr_id", trId);
        headers.add("custtype", "P");

        return headers;
    }
}
```

&nbsp; 위 코드에서 액세스 토큰과 관련된 플로우는 다음과 같다.

1. 주식 종목 코드를 순회하면서, 각 주식 종목 코드마다 `kisStockClient.getStockMinutesChartInfo(code, now)` 호출
2. 해당 메서드 내에서 `kisRequestFactory.getHttpHeader(MINUTES_CHART_TR_ID)`를 호출
3. 해당 메서드 내에서 헤더에 액세스 토큰을 넣기 위해 매번 Redis에 저장된 한국투자증권 액세스 토큰을 조회

&nbsp; 위 플로우에 따라 매 호출마다 Redis에서 액세스 토큰을 조회하여 총 2,742번의 조회가 순간적으로 일어나게 된다.

&nbsp; Redis는 단일 쓰레드로 동작하기 때문에 이러한 **단발성으로 몰리는 요청(Bursty Request)**은 문제가 될 수 있다.

### 2. 호출 유량 제한 발생 시 예외 처리


```java
package muzusi.infrastructure.kis.stock;

@Component
@RequiredArgsConstructor
public class KisStockClient {
    /* ... */

    public StockChartInfoDto getStockMinutesChartInfo(String code, LocalDateTime time, String accessToken) { /* ... */ }
}
```

```java
@Profile("dev")
@Slf4j
@Aspect
@Component
@RequiredArgsConstructor
public class ExternalApiExceptionAspectForDev {

    @Around("execution(* muzusi.infrastructure..*(..))")
    public Object handleServiceExceptions(ProceedingJoinPoint joinPoint) throws Throwable {
        try {
            return joinPoint.proceed();
        } catch (NewsApiException e) {
            log.error("[NEWS ERROR] {}", e.getMessage());
            throw e;
        } catch (KisApiException e) {
            log.error("[KIS ERROR] {}", e.getMessage());
            throw e;
        } catch (KisOAuthApiException e) {
            log.error("[KIS OAUTH ERROR] {}", e.getMessage());
            return null;
        }
    }
}
```

&nbsp; 기존 코드에서는 `KisStockClient`에서 예외가 발생한 경우, AOP를 통하여 이에 대한 로그를 출력하는 방식으로 로깅에 중점을 맞추어 처리를 했었다.

&nbsp; 즉, 해당 코드는 로깅만 할 뿐이지 주식 분봉 데이터 API를 호출하고 에러가 발생한 경우에 로깅 후 다시 예외를 발생시켜 더이상의 주식 분봉 데이터를 받아올 수가 없다.

&nbsp; 기존 로직에서는 15번의 호출 기준으로 Thread를 1초씩 Sleep하였으므로 호출 유량 제한 등의 에러 응답이 발생하지 않아서 해당 부분을 간과하고 넘어간 것 같다. 그러나, 이후 쓰로틀링을 적용하면서 API 호출 유량 제한에 의한 에러가 발생하기 시작하였고 이에 대한 적절한 처리가 필요하였다. 본론에서 재시도 로직을 도입하여 해당 과정을 해결한 내용을 서술할 것이다.

# 본론 - Solution

## 관련 PR
<i class="fas fa-link"></i> [Feature: 한국투자증권 주식 분봉 데이터 API 호출 기능 쓰로틀링 적용
](https://github.com/Team-Digimon/muzusi-was/pull/119)




## 실행 환경
- Processor: Macbook Air M1
- Memory: 16GB
- DB: Redis in Docker Container
- Framework: SpringBoot 3.4.0, guava 33.4.8

&nbsp; 본 문제를 해결하기 위하여 Java, Spring 진영에서 사용하는 여러가지 쓰로틀링 기술들을 찾아보았다. Bucket4j, Guava, RateLimitJ 등 다양한 라이브러리가 있었고, 그 중 Google에서 만든 Guava를 사용하기로 하였다.

&nbsp; Guava는 처리율 제한(Rate Limit) 기능 외에도 다양한 기능등을 제공한다.


## 재시도 로직 적용

&nbsp; 쓰로틀링을 적용하기에 앞서 먼저 재시도 로직을 적용하여야 했다.

&nbsp; 쓰로틀링을 사용하여 처리율을 제한하더라도 호출 유량 제한 예외 응답이 오는 경우가 있었는데, 이는 한국투자증권에서 API 호출 유량 제한 방식이 '슬라이딩 윈도우' 방식을 사용하여 초당 15번의 요청 중 경계점에 요청이 몰릴 경우 호출 유량 제한 정책에 위배되는 것으로 추측된다. 

> 해당 내용은 아직 정확하지가 않아서, 차후 한국투자증권에 질문 후 답변을 받으면 업데이트할 예정이다.

&nbsp; `RateLimter` 객체는 생성 시 초당 허용량(pps, permit per second)을 `double` 형태로 할당하게 된다. 이는 guava가 Token Bucket 방식으로 동작한다는 것을 나타내며, 따라서 한국투자증권 API 서버가 슬라이딩 윈도우 방식으로 호출 유량을 제한할 경우 이에 위배되는 케이스가 발생하는 이유라 생각한다.

&nbsp; 따라서, API 호출 시 호출 유량 초과 에러가 발생한다면 재시도를 실시해야한다. 

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class KisErrorParser {
    private final ObjectMapper objectMapper;
    
    private static final String ERROR_MSG_KEY = "msg_cd";
    private static final String API_REQUEST_EXCEEDED_ERROR_CODE = "EGW00201";
    
    /**
     * 한국투자증권 응답 에러 메시지에서 API 호출 유량 초과 인지를 확인하는 메서드
     *
     * @param errorMessage  한국투자증권 응답 에러 메시지
     * @return              API 호출 유량 초과에 따른 에러 발생 여부
     */
    public boolean isApiRequestExceeded(String errorMessage) {
        try {
            int startIndex = errorMessage.indexOf('{');
            
            if (startIndex == -1) {
                return false;
            }
            
            String errorCode = this.parseErrorCode(errorMessage, startIndex);
            
            if (errorCode == null) {
                return false;
            }
            
            if (API_REQUEST_EXCEEDED_ERROR_CODE.equals(errorCode)) {
                return true;
            }
            
            return false;
        } catch (JsonProcessingException e) {
            log.error("[JSON PARSING ERROR] Failed to parse a KIS error message");
            return false;
        }
    }
    
    /**
     * 한국투자증권 응답 에러 메시지의 Json 파트 부분에서 에러 응답 코드를 파싱하는 메서드
     *
     * @param errorMessage  한국투자증권 응답 에러 메시지
     * @param startIndex    Json 파트 부분 시작 인덱스
     * @return              에러 응답 코드
     */
    private String parseErrorCode(String errorMessage, int startIndex) throws JsonProcessingException {
        JsonNode errorNode = objectMapper.readTree(errorMessage.substring(startIndex));
        JsonNode errorCode = errorNode.get(ERROR_MSG_KEY);
        
        return errorCode == null ? null : errorCode.asText();
    }
}
```

&nbsp; 먼저, 한국투자증권에서 온 에러 응답을 파싱하기 위해 `KisErrorParser` 클래스를 정의한다. 해당 클래스의 `isApiRequestExceeded(...)`는 API 호출 후 에러 응답 메시지를 분석해서 호출 유량 초과(EGW00201)인지 여부를 반환한다.

```java
public void saveStockMinutesChartAndInquirePrice() throws InterruptedException {
    int count = 0;
    Map<String, StockChartInfoDto> stockChartInfoMap = new HashMap<>(BATCH_SIZE);
    LocalDateTime now = LocalDateTime.now();
    String accessToken = kisAuthService.getAccessToken();

    for (String code : stockCodeProvider.getAllStockCodes()) {
        try {
            rateLimiter.acquire();
            StockChartInfoDto stockChartInfo = kisStockClient.getStockMinutesChartInfo(code, now, accessToken);
            stockChartInfoMap.put(code, stockChartInfo);


            if (++count >= BATCH_SIZE) { // BATCH_SIZE 이상일 경우 삽입
                stockMinutesService.saveAllInCache(stockChartInfoMap.values());
                stockPriceService.saveAllInCache(convertToStockPriceMap(stockChartInfoMap));
                stockChartInfoMap.clear();
                count = 0;
            }
        } catch (Exception e) {
            // 해당 에러가 호출 유량 초과에 의한 에러인지 여부를 확인
            if (kisErrorParser.isApiRequestExceeded(e.getMessage())) {
                // 호출 유량 초과라면 재시도 로직 수행
                retrySaveStockMinutesChartAndInquirePrice(stockChartInfoMap, code, now, accessToken);
            } else {
                throw new KisApiException(e);
            }
        }
    }

    if (!stockChartInfoMap.isEmpty()) {
        stockMinutesService.saveAllInCache(stockChartInfoMap.values());
        stockPriceService.saveAllInCache(convertToStockPriceMap(stockChartInfoMap));
    }
}

/**
 * 한국투자증권 주식 분봉 데이터 호출 시 API 호출 유량 초과로 인한 실패 시 재시도를 수행하는 메서드
 *
 * - 안정성 보장을 위한 1초 쓰레드 정지
 * - API 호출 유량 초과된 주식 종목 코드를 바탕으로 재시도 수행 및 주식 분봉 차트 Map에 저장
 *
 * @param stockChartInfoMap         주식 분봉 차트 Map
 * @param code                      API 호출 유량 초과가 발생한 주식 종목 코드
 * @param now                       주식 분봉 데이터 호출 시각
 */
private void retrySaveStockMinutesChartAndInquirePrice(
        Map<String, StockChartInfoDto> stockChartInfoMap,
        String code,
        LocalDateTime now,
        String accessToken
) throws InterruptedException {
    Thread.sleep(1000);
    StockChartInfoDto stockChartInfo = kisStockClient.getStockMinutesChartInfo(code, now, accessToken);
    stockChartInfoMap.put(code, stockChartInfo);
}
```

> 해당 코드에서 이미 `RateLimiter` 코드가 포함되어있지만, 해당 부분은 감안해주시길 바라겠습니다.

&nbsp; API 호출 후 예외가 발생한다면 `KisErrorParser`에 의해 API 호출 유량 초과 여부를 확인한 뒤, 맞다면 재시도 메서드를 호출한다.

&nbsp; 재시도 메서드 `retrySaveStockMinutesChartAndInquirePrice(...)`에서는 안전성을 위해 1초간 쓰레드를 대기시킨다. 이후, 에러가 발생한 주식 종목 코드를 통해 한 번 더 API 요청을 보낸 뒤 응답 값을 `stockChartInfoMap`에 삽입한다.

&nbsp; 해당 로직은 `Thread.sleep(1000L)`을 통해 호출 유량 초과를 방지하지만, 주식 분봉 데이터 API가 아닌 다른 데이터가 동일한 시각에 급격하게 호출(Bursty Request)될 경우 또한 에러가 발생할 수 있다. 

&nbsp; 이는 차후 한국투자증권 관련 API가 공통으로 사용하는 `RateLimiter` 객체를 Bean으로 등록할 때, 재시도 메서드 내에서도 `rateLimiter.acquire()`를 호출하여 처리할 예정이다.

## RateLimiter 적용

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class KisStockChartUpdater {
    // ...
    private final RateLimiter rateLimiter = RateLimiter.create(15);
    private static final int BATCH_SIZE = 500;

public void saveStockMinutesChartAndInquirePrice() throws InterruptedException {
    int count = 0;
    Map<String, StockChartInfoDto> stockChartInfoMap = new HashMap<>(BATCH_SIZE);
    LocalDateTime now = LocalDateTime.now();
    String accessToken = kisAuthService.getAccessToken();

    for (String code : stockCodeProvider.getAllStockCodes()) {
        try {
            // 각 순회 내부에서 rateLimter 객체 허용량이 사용 가능한지 확인 후 로직 수행
            rateLimiter.acquire();
            StockChartInfoDto stockChartInfo = kisStockClient.getStockMinutesChartInfo(code, now, accessToken);
            stockChartInfoMap.put(code, stockChartInfo);


            if (++count >= BATCH_SIZE) {
                stockMinutesService.saveAllInCache(stockChartInfoMap.values());
                stockPriceService.saveAllInCache(convertToStockPriceMap(stockChartInfoMap));
                stockChartInfoMap.clear();
                count = 0;
            }
        } catch (Exception e) {
            if (kisErrorParser.isApiRequestExceeded(e.getMessage())) {
                retrySaveStockMinutesChartAndInquirePrice(stockChartInfoMap, code, now, accessToken);
            } else {
                throw new KisApiException(e);
            }
        }
    }

    if (!stockChartInfoMap.isEmpty()) {
        stockMinutesService.saveAllInCache(stockChartInfoMap.values());
        stockPriceService.saveAllInCache(convertToStockPriceMap(stockChartInfoMap));
    }
}
```

&nbsp; RateLimier 적용은 `RateLimiter` 객체를 생성하고, 사용할 때 `.acquire()` 메서드를 호출하면 된다.

```java
// RateLimiter.class
public static RateLimiter create(double permitsPerSecond) {
    return create(permitsPerSecond, RateLimiter.SleepingStopwatch.createFromSystemTimer());
}
```

&nbsp; `RateLimiter` 객체를 생성할 때 `RateLimiter.create(double permitPerSecond)` 정적 메서드를 통해 생성한다. 인자명에서도 알 수 있듯이 초당 허용된 허용량을 `double`로 전달받는다.

```java
// RateLimiter.class
@CanIgnoreReturnValue
public double acquire() {
    return this.acquire(1);
}

@CanIgnoreReturnValue
public double acquire(int permits) {
    long microsToWait = this.reserve(permits);
    this.stopwatch.sleepMicrosUninterruptibly(microsToWait);
    return 1.0 * (double)microsToWait / (double)TimeUnit.SECONDS.toMicros(1L);
}
```

&nbsp; `.acquire()` 메서드는 `.acquire(1)`과 동일하다. 

&nbsp; `RateLimiter`를 만들 때 인자로 넘겨준 값이 TokenBucket의 허용량이 된다면, `.acquire()` 메서드에서 인자로 넘겨준 값은 TokenBucket에서 가져오는 획득량을 지칭한다.

&nbsp; <u>초당 총 획득량이 허용량을 넘긴 경우에 해당 쓰레드를 Token을 획득할 때까지 정지</u>하게 된다.

&nbsp; 현재 로직에서는 허용량이 초당 15회이며, 각 순회마다 1의 획득량을 요구한다. 즉, 초당 최대 15개의 요청이 수행된다는 것이다. 이를 통하여 API 호출 유량 제한에 대응하였다.

## 한국투자증권 액세스 토큰 조회 위치 변경

&nbsp; 앞서 서론에서 언급하였던 [한국투자증권 액세스 토큰 조회 위치 문제](#problem-at)는 `KisAuthService.getAccessToken()`의 위치만 바꾸면 해결되는 문제이다.

```java
@Component
@RequiredArgsConstructor
public class KisRequestFactory {
    private final KisAuthService kisAuthService;
    private final KisProperties kisProperties;

    public HttpHeaders getHttpHeader(String trId) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        headers.add("authorization", kisAuthService.getAccessToken());
        headers.add("appkey", kisProperties.getAppKey());
        headers.add("appsecret", kisProperties.getAppSecret());
        headers.add("tr_id", trId);
        headers.add("custtype", "P");

        return headers;
    }
    
    // 액세스 토큰을 전달받는 메서드 오버로딩
    public HttpHeaders getHttpHeader(String trId, String accessToken) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        
        headers.add("authorization", accessToken);
        headers.add("appkey", kisProperties.getAppKey());
        headers.add("appsecret", kisProperties.getAppSecret());
        headers.add("tr_id", trId);
        headers.add("custtype", "P");
        
        return headers;
    }
}
```

```java
@Component
@RequiredArgsConstructor
public class KisStockClient {
    private final KisProperties kisProperties;
    private final ObjectMapper objectMapper;
    private final KisRequestFactory kisRequestFactory;
    private static final int MINUTES_GAP = 10;
    private static final String MINUTES_CHART_TR_ID = "FHKST03010200";
    private static final String INQUIRE_PRICE_TR_ID = "FHKST01010100";

    // 파라미터에 액세스 토큰 추가
    public StockChartInfoDto getStockMinutesChartInfo(String code, LocalDateTime time, String accessToken) { ... }
}
```

```java
// KisStockChartUpdater
public void saveStockMinutesChartAndInquirePrice() throws InterruptedException {
    int count = 0;
    Map<String, StockChartInfoDto> stockChartInfoMap = new HashMap<>(BATCH_SIZE);
    LocalDateTime now = LocalDateTime.now();
    String accessToken = kisAuthService.getAccessToken(); // 한국투자증권 액세스 토큰 조회

    for (String code : stockCodeProvider.getAllStockCodes()) {
        try {
            rateLimiter.acquire();
            // 한국투자증권 액세스 토큰 전달
            StockChartInfoDto stockChartInfo 
                = kisStockClient.getStockMinutesChartInfo(code, now, accessToken);
            /* ... */
        }
    }
}
```

&nbsp; 위 코드에서 `KisAuthService.getAccessToken()`이 조회되는 위치를 상위 클래스로 바꾸어 모든 순회마다 Redis에 저장된 한국투자증권 액세스 토큰 조회 요청을 보내지 않고, 단 1번만 조회 요청을 보내도록 개선시켰다.

&nbsp; 이 적용은 성능(호출 시간) 상 큰 이점을 보지는 못하였다. Redis가 인메모리 데이터베이스라 워낙 빠르게 조회가 되는 점과 단일값 조회인 점을 고려하면 충분히 예상되는 결과이다.

&nbsp; 그러나, 호출 시간 상에 큰 이점을 보지 못하더라도 Redis에 불필요한 접근 횟수를 줄이는 것만으로도 큰 성능 개선이라 생각한다.

&nbsp; 왜냐하면 Redis는 명령어 처리를 단일 쓰레드로 수행하기 때문에 한 번에 접근 요청이 몰릴 경우, 요청의 처리가 밀리는 현상이 발생할 수 있기 때문이다. 기존 상황에서 2,742번의 한국투자증권 액세스 토큰 조회 요청이 있었기에 동일한 시간에 Redis를 사용하는 리프레시 토큰, 주식 랭킹 관련 요청이 있을 경우 병목으로 이어질 수 있었기에 접근 횟수를 줄이는 것도 큰 성능 개선이라 생각한다.

# 테스트

&nbsp; 위와 같은 과정을 통해 쓰로틀링 + 재시도 로직 + 액세스 토큰 조회 로직 개선 등의 리팩토링을 마친 후 해당 메서드의 성능(호출 시간)을 비교해보았다.

<table style="border: 0.5px solid #d1d1d1; border-radius: 5px;" >
    <tbody>
        <tr style="border: 0.5px solid #d1d1d1;">
            <td style="border: inherit">
                <img src="/assets/img/docs/web/kis-api-throttling/thread-sleep-result.png" alt="thread-sleep-result" />
            </td>
            <td style="border: inherit">
                <img src="/assets/img/docs/web/kis-api-throttling/throttling-result.png" alt="throttling-result" />
            </td>
        </tr>
        <tr style="text-align: center; border: 0.5px solid #d1d1d1; background-color: rgba(0, 0, 0, 0.02);">
            <td style="border: inherit;">기존 (432초)</td>
            <td style="border: inherit;">리팩토링 후 (184초)</td>
        </tr>
    </tbody>
</table>

&nbsp; 기존 Thread Sleep 방식에서 432초가 소요되었던 것이, 리팩토링 후 184초가 소요되었다. 따라서, 약 2.35배의 성능 개선을 확인할 수 있었다.

&nbsp; 이 성능 개선의 가장 큰 원인은 **idle하게 낭비되는 시간을 줄이는 것**이다.

<table style="border: 0.5px solid #d1d1d1; border-radius: 5px;" >
    <tbody>
        <tr style="border: 0.5px solid #d1d1d1;">
            <td>
                <img src="/assets/img/docs/web/kis-api-throttling/thread-sleep-diagram.png" alt="thread-sleep-digram" />    
            </td>
        </tr>
        <tr style="text-align: center; border: 0.5px solid #d1d1d1; background-color: rgba(0, 0, 0, 0.02);">
            <td>기존</td>
        </tr>
        <tr>
            <td>
                <img src="/assets/img/docs/web/kis-api-throttling/throttling-diagram.png" alt="throttling-diagram" />
            </td>
        </tr>
        <tr style="text-align: center; background-color: rgba(0, 0, 0, 0.02);">
            <td>쓰로틀링 적용 후</td>
        </tr>
    </tbody>
</table>

&nbsp; 해당 솔루션의 핵심은 15번의 API 요청 이후 idle한 시간을 줄이는 것이다. API를 요청하는 것 자체에 걸리는 시간이 있기 때문에, 기존 코드에서는 API 요청에 걸리는 시간 + idle한 시간(1초)으로 인하여 3분이라는 오버헤드가 생기가 되었다.

&nbsp; 쓰로틀링을 적용한 리팩토링을 통하여 idle한 시간이 줄게되고, 호출 유량 초과 에러가 응답된 경우에만 요청의 안전성을 보장하기 위해 1초 간 대기를 갖게된다. 

&nbsp; 기존에는 호출 유량 에러가 발생하지 않았음에도 무조건 15번의 요청마다 1초 씩 대기를 하게되어서 API 요청에 준하는 만큼의 대기 시간 오버헤드가 발생하였던 것이다.

## 허용량에 따른 처리 속도 비교

&nbsp; 여기서, <span style="font-style: italic;" class="underline-highlight">"<span class="code">RateLimiter</span>의 허용량을 더욱 낮추면 슬라이딩 윈도우더라도 호출 유량 초과 에러가 발생할 확률이 줄어들기 때문에 성능이 더욱 개선될까?"</span>라는 의문이 들었다. 

&nbsp; 따라서, `RateLimiter`의 허용량을 각각 10, 15로 설정해 테스트를 진행해보았다.

```java
// KisStockChartUpdater
private final RateLimiter rateLimiter = RateLimiter.create(10);

private final RateLimiter rateLimiter = RateLimiter.create(15);
```

<table style="border: 0.5px solid #d1d1d1; border-radius: 5px;" >
    <tbody>
        <tr style="border: 0.5px solid #d1d1d1;">
            <td style="border: inherit">
                <img src="/assets/img/docs/web/kis-api-throttling/throttling-10-result.png" alt="throttling-10-result" />
            </td>
            <td style="border: inherit">
                <img src="/assets/img/docs/web/kis-api-throttling/throttling-result.png" alt="throttling-result" />
            </td>
        </tr>
        <tr style="text-align: center; border: 0.5px solid #d1d1d1; background-color: rgba(0, 0, 0, 0.02);">
            <td style="border: inherit;">10pps (274초)</td>
            <td style="border: inherit;">15pps (184초)</td>
        </tr>
    </tbody>
</table>

&nbsp; 결과는 허용량이 10일 때가 274초, 허용량이 15일때가 184초가 소요되었다.

&nbsp; 즉, 허용량을 낮추면 호출 유량 초과 에러 응답율이 줄기는하지만, <u>처리량 자체가 감소</u>하게 되므로 전체 소요 시간이 길어지게 된 것이다.

&nbsp; 따라서, 이러한 적절한 trade-off 관계에 맞는 허용량을 설정하는 것이 중요하고, 허용량을 높여 호출 유량 초과 에러가 응답된 경우 재시도 로직을 통하여 이를 보완하는 대비책도 필요하다.

# 결론

&nbsp; 코드 리팩토링을 하며 주로 아키텍처 관점에서의 SRP, 결합도, 응집도 등의 문제를 해결하며 유지보수 측면에서의 개선을 하였다.

&nbsp; 이번 작업을 통해 알고리즘적으로 잘못된 로직을 확인하고, 이를 해결해나가는 과정에서 정말 코드를 잘 작성한다는 것이 성능에도 중요한 영향을 미칠 수 있다는 것을 다시 한 번 느끼게되었다. 또한, 해당 상황은 문제 정의부터 다시 되돌아봤기 때문에 해결할 수 있었던 것으로 생각한다.

&nbsp; 또한, 쓰로틀링에 관해 찾아보면 주로 서버의 입장에서 클라이언트의 요청량을 제한하기 위해 적용하는 경우를 많이 볼 수 있지만, 쓰로틀링이 적용된 외부 API 서버에 요청을 보내는 클라이언트의 입장에서 이 제한에 대응하기 위해서 쓰로틀링을 적용한다는 해결법도 다양한 시각을 얻을 수 있었던 경험이 된 것 같다.

&nbsp; 그러나, 리팩토링된 현재 로직에서도 개선점은 존재한다.

&nbsp; 한국투자증권 API 요청 클래스(Bean)들이 전역적으로 사용하는 RateLimiter Bean을 등록하여 호출 유량 제한을 전반적으로 관리할 수 있도록 하거나, 주식 차트 정보 Map에 저장된 데이터를 Redis Pipeline을 사용하여 일괄적으로 삽입하는 등의 개선할 부분이 남아있다.

&nbsp; RateLimiter를 Bean으로 등록하여 한국투자증권 API 요청 클래스에서 동일한 객체를 주입받아 사용하는 것은 리팩토링 작업의 규모가 크기 때문에 별도의 PR로 진행할 예정이다.

&nbsp; Redis Pipeline의 경우에는 테스트 결과 호출 시간 상의 큰 개선점이 나타나지 않아서 차후 네트워크 연결 관점 등 다양한 측면에서 이점을 확인하고 이를 분석한 뒤 작업을 진행할 예정이다.

# \#Reference
- [자바 스프링에서 처리율 제한 기능을 구현하는 4가지 방법](https://hogwart-scholars.tistory.com/entry/Spring-Boot-%EC%9E%90%EB%B0%94-%EC%8A%A4%ED%94%84%EB%A7%81%EC%97%90%EC%84%9C-%EC%B2%98%EB%A6%AC%EC%9C%A8-%EC%A0%9C%ED%95%9C-%EA%B8%B0%EB%8A%A5%EC%9D%84-%EA%B5%AC%ED%98%84%ED%95%98%EB%8A%94-4%EA%B0%80%EC%A7%80-%EB%B0%A9%EB%B2%95#Guava%20-%20RateLimiter-1)
- [Guava RateLimiter](https://guava.dev/releases/19.0/api/docs/index.html?com/google/common/util/concurrent/RateLimiter.html)