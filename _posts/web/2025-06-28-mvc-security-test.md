---
layout: posts
title:  "@WebMvcTest 시 CustomUserDetails가 바인딩 되지 않는 이유"
author_profile: true
sidbar:
  nav: "main"
category: "web"
description: "Presentation Layer에 대한 단위 테스트 진행 시, CustomUserDetails를 메서드 파라미터로 사용하는 핸들러 메서드에서 값을 바인딩하지 못하는 문제를 발견하였다. 해당 문제를 찾은 과정, 발생 이유와 해결 방법을 해당 포스팅에 담아보고자 한다."
published: true
show_date: true
---

# 서론 및 문제 상황

&nbsp; 여행 기록 관리 플랫폼 프로젝트를 진행하며 철저한 단위 테스트 수행을 하나의 목표로 설정하며 주로 Controller와 각종 비지니스 로직을 처리하는 Service 클래스에 대한 테스트를 수행하였다. 그 중 Presentation Layer에 대한 테스트 진행 시 흔히 사용하는 `@WebMvcTest` 어노테이션을 사용하였다.

&nbsp; `@WebMvcTest`는 Spring MVC에서 Presentation Layer에 속하는 여러 빈들과 설정을 자동으로 로드하여 간편한 테스트 수행을 가능하게 하는 어노테이션이다. 또한, Spring MVC 프로젝트 제작 시 Spring Security는 인증, 인가 등 보안 관련 작업을 위해 사용한다. Controller에 요청이 도달하기 전, 요청에 관한 여러가지 검증이나 처리를 FilterChain 구조를 통하여 수행하며 인증 정보 객체(Authentication)를 등록하여 요청-응답 생명 주기 동안 유지하는 기능을 제공하기도 한다.

&nbsp; 사용자 인증 정보(Authentication)을 등록하기 위해 해당 객체의 Principal 필드에 대해 `UserDetails`의 구현체를 할당하여 사용한다. 본 프로젝트에서 또한 이와 같은 구조를 사용하였으며 자세한 내용은 아래에서 자세하게 설명한다.

&nbsp; 여러가지 사용자에 따른 별도의 구현체가 있어야할 경우를 대비하여 `UserDetails`를 상속받은 `CustomUserDetails` 인터페이스를 정의하고, 이에 대한 구현체 `CustomUserDetailsImpl`를 생성해 사용자 인증 정보를 등록해 사용하였다.

```java
public interface CustomUserDetails extends UserDetails {
    Role getRole();
    Long getUserId();
}
```

```java
@Getter
@RequiredArgsConstructor
public class CustomUserDetailsImpl implements CustomUserDetails {
    private final User user; // Custom User

    /* ... */
}
```

&nbsp; 또한, SecurityContext에 등록된 사용자 인증 정보를 컨트롤러의 핸들러 메서드에서 사용하기 위하여 메서드 파라미터 `CustomUserDetails userDetails`에 `@AuthenticationPrincipal` 어노테이션을 붙여 Principal 정보가 자동으로 해당 메서드 파라미터에 바인딩 되도록 하였다.

```java
@RestController
public class TestController {

    @GetMapping("/test")
    public ResponseEntity<?> getTest(@AuthenticationPrincipal CustomUserDetails userDetails) {
        System.out.println("user Id : " + userDetails.getUserId());
        System.out.println("user : " + userDetails);
        System.out.println("user name : " + userDetails.getUsername());
        return ResponseEntity.ok("success");
    }
}
```

&nbsp; 해당 컨트롤러는 문제를 확인하기 위해 임시로 생성한 컨트롤러이다. 실제 코드는 `userDetails.getUserId()`를 통해 요청을 보낸 사용자의 id(pk) 정보를 서비스 클래스의 메서드로 넘겨주는 로직으로 구성되어 있다.

>
```java
// 실제 코드 예시
@Override
@GetMapping("/main")
public ResponseEntity<?> getMainTrip(
        @AuthenticationPrincipal CustomUserDetails userDetails
) {
    TripRes.TripMainInfo tripMainInfo = tripQueryService.getTripMainInfo(userDetails.getUserId());
    return ResponseEntity.ok().body(SuccessResponse.from(tripMainInfo));
}
```

&nbsp; 테스트는 `@WebMvcTest`와 `MockMvc`를 사용하여 진행하였다. 테스트 코드는 아래와 같다.

```java
@WebMvcTest(
        controllers = TestController.class,
        excludeFilters = {
                @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE, classes = {OncePerRequestFilter.class})
        }
)
public class TestControllerTest {
    private MockMvc mockMvc;
    
    private CustomUserDetails userDetails;
    
    void setUpUserDetails(Role role) {
        User user = User.builder()
                .username("test")
                .password("password")
                .email("test@test.com")
                .role(role)
                .nickname("nickname")
                .build();
        
        ReflectionTestUtils.setField(user, "id", 1L);
        
        userDetails = new CustomUserDetailsImpl(user);
    }

    @BeforeEach
    void setUp(WebApplicationContext webApplicationContext) {
        this.mockMvc = MockMvcBuilders
                .webAppContextSetup(webApplicationContext)
                .apply(springSecurity()) // SpringSecurity 사용을 위한 설정
                .alwaysDo(print())
                .build();
    }

    @Test
    @DisplayName("CustomUserDetails Test")
    void testUserDetails() throws Exception {
        // given
        setUpUserDetails(Role.USER);
        
        // when
        ResultActions resultActions = mockMvc.perform(
                get("/test")
                        .with(user(userDetails)) // UserDetails 등록 - CustomUserDetailsImpl
        );
        
        // then
        resultActions
                .andExpect(status().isOk());
    }
}
```

&nbsp; 위 코드는 단순히 테스트 환경에서 GET/test로 요청을 보내기 위한 코드이며, SpringSecurity 관련 설정을 로드하고 `CustomUserDetailsImpl` 구현체를 `UserDetails`로 등록한 요청 상황을 나타낸다.

&nbsp; 결과적으로 컨트롤러 핸들러 메서드에 정의된 출력문에 의해 확인해보면, `userDetails` 파라미터에 `null` 값이 바인딩 되는 문제가 발생하였다.

<img src="/assets/img/docs/web/mvc-security-test/test-passed.png" alt="test-paased" />

&nbsp; 단위 테스트는 특정 레이어에만 집중되어 있다.

&nbsp; 따라서, 메서드에서 호출되는 기타 클래스의 메서드는 Stubbing을 통해 예상 반환값 등을 미리 설정하기 때문에 동작 자체에 대한 테스트가 실패할 경우는 거의 없지만, `ArgumentCaptor` 등을 통하여 요청을 보낸 사용자의 id와 메서드 파라미터로 전달된 `userDetails.id`를 비교하는 등의 작업을 수행한다면 테스트는 실패할 것이다. 또한, id 외에도 `userDetails`의 정의된 필드나 메서드 등을 사용해야 하는 경우가 존재한다면 NPE 예외 발생으로 인한 테스트 실패 가능성이 존재한다.

&nbsp; 본 포스팅에서는 <u>위와 같은 상황이 왜 발생하는지</u>와 <u>어떻게 해결할 수 있는지</u>에 대해서 찾아본 트러블 슈팅 내용을 다루고자 한다. 또한, 현재 Spring-Security Github에 이슈로 해당 문제에 대한 나름의 해결책을 제시해놓기도 하였으며 해당 경험을 공유하고자 한다.

# 본론

## 문제 발생 이유

&nbsp; 먼저 해당 문제와 비슷한 여러가지 상황을 구성하여 테스트를 진행하여 해당 문제가 발생하는 상황을 추측해보기로 하였다. 아래는 해당 문제의 원인을 찾아가는 과정을 나열하였다.

### 1. 메서드 파라미터 타입 변경

&nbsp; 우선, 메서드 파라미터에 `CustomUserDetails`를 사용한 이유는 `UserDetails`를 상속받은 인터페이스이므로 `AuthenticationPrincipalArgumentResolver`에 의해 자동으로 타입 캐스팅이 되어 `getUserId()`와 같은 사용자 정의 메서드를 바로 사용할 수 있게하기 위함이다.

&nbsp; 실제 서버를 실행하고, 운영 환경에서는 문제가 없었지만 테스트 환경에서는 테스트용 설정 때문에 직접 정의한 `CustomUserDetails` 인터페이스가 문제가 될 수도 있을 가능성이 있다는 생각에 `UserDetails`로 메서드 파라미터 타입을 변경하여 테스트를 진행해보았다.

```java
@RestController
public class TestController {

    @GetMapping("/test")
    public ResponseEntity<?> getTest(@AuthenticationPrincipal UserDetails userDetails) { // 메서드 파라미터 타입 변경
        // System.out.println("user Id : " + userDetails.getUserId()); // 타입 변경으로 인한 생략
        System.out.println("user : " + userDetails);
        System.out.println("user name : " + userDetails.getUsername());
        return ResponseEntity.ok("success");
    }
}
```

<img src="/assets/img/docs/web/mvc-security-test/test-passed-userDetails.png" alt="test-passed-userDetails" />

&nbsp; 위 결과에서 알 수 있듯이 `UserDetails`를 사용한 경우에는 메서드 파라미터에 값이 문제없이 바인딩된다. 

&nbsp; 테스트 환경에서 `UserDetails`가 아닌 사용자 직접 정의한 인터페이스 `CustomUserDetails`를 사용하면 파라미터에 바인딩이 제대로 되지 않는다는 것은 확인했지만, 여전히 이것이 어떠한 차이에 의해서 발생하는지는 의문이었다.

### 2. @EnableWebSecurity 클래스 Import

&nbsp; `@WebMvcTest`는 `Filter`나 `WebMvcConfigurer`를 구현한 Bean들을 자동으로 컨텍스트로 등록해 테스트를 진행한다. 

&nbsp; `@WebMvcTest`는 `@Configuration` 클래스들을 빈으로 등록하지는 않기 때문에 `@EnableWebSecurity`를 통하여 사용자가 정의한 시큐리티 설정 클래스(이하, `SecurityConfig`)는 빈으로 등록되지 않는다. 따라서, 사용자 정의 시큐리티 관련 설정을 사용할 수 없다.

> 추가적으로, `SecurityConfig` 클래스는 Bean으로 로드되지 않지만, 사용자가 정의 커스텀 필터(Jwt 인증, 인증/인가 관련 예외 처리 등)는 Bean으로 로드 된다. <br/> <br/>
따라서, 커스텀 필터 등에서 `@Service` 클래스와 같이 `@WebMvcTest`에 의해 기본적으로 빈으로 등록되지 않는 의존성이 존재한다면 의존성 주입이 불가능하여 예외가 발생한다.
이를 해결하기 위해 `@WebMvcTest.excludeFilters` 옵션을 사용하여 `OncePerRequestFilter.class`를 상속받아 구현한 커스텀 필터들이 로드되지 않도록 처리하였다.

&nbsp; 처음에는 "내가 직접 정의한 `SecurityConfig` 클래스가 빈으로 등록되지 않아서 메서드 파라미터를 바인딩하지 못하나?"라는 생각으로 실제 사용 중인 `SecurityConfig` 클래스가 아닌 `DummySecurityConfig` 클래스를 만들어 사용해보기로 하였다.

```java
@EnableWebSecurity
public class DummySecurityConfig {
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        return http
                .authorizeHttpRequests(authorize ->
                        authorize
                                .requestMatchers("/test/get").hasAuthority(Role.USER.name()))
                .build();
    }
}
```

```java
@WebMvcTest(
        controllers = TestController.class,
        excludeFilters = {
                @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE, classes = {OncePerRequestFilter.class})
        }
)
@Import({DummySecurityConfig.class})
public class TestControllerTest {
    /* ... */
}
```

&nbsp; 위와 같이 `DummySecurityConfig` 클래스를 Import한 후 테스트를 진행하였을 때는 `UserDetails`와 `CustomUserDetials` 타입의 파라미터에 대한 결과 모두 제대로 값이 바인딩 되었다.

---

<div style="display: flex; justify-content: center;">
    <div style="display: inline-block;">
        <table style="border: 0.5px solid #d1d1d1; border-radius: 5px;">
            <tr>
                <td style="background-color: #FAFAFA; border-right: 0.5px solid #d1d1d1;"></td>
                <td style="text-align: center; background-color: #FAFAFA;">UserDetails</td>
                <td style="text-align: center; background-color: #FAFAFA;">CustomUserDetails</td>
            </tr>
            <tr>
                <td style="background-color: #FAFAFA; border-right: 0.5px solid #d1d1d1;">@WebMvcTest 기본 설정만 사용한 경우</td>
                <td style="text-align: center;">성공</td>
                <td style="text-align: center;">실패</td>
            </tr>
            <tr>
                <td style="background-color: #FAFAFA; border-right: 0.5px solid #d1d1d1;">@EnableWebSecurity 클래스를 Import한 경우</td>
                <td style="text-align: center;">성공</td>
                <td style="text-align: center;">성공</td>
            </tr>
        </table>
    </div>
</div>

&nbsp; 2개의 경우에 대한 테스트를 통해 `@EnableWebSecurity` 클래스를 Import하면 두 타입의 파라미터 모두 값이 제대로 바인딩 된다는 것을 알게 되었지만, 왜 해결이 되는지와 `@EnableWebSecurity` 클래스를 Import 하지 않은 경우에 `CustomUserDetails`는 왜 바인딩이 제대로 되지 않는지에 대한 궁금증은 해결되지 않았다.

&nbsp; 우선은 `UserDetails`와 `CustomUserDetails` 모두 테스트 환경에서도 바인딩 가능하다는 사실을 알게 되었다. 즉, `@WebMvcTest`만 사용해서 테스트를 진행할 때 바인딩이 제대로 되지 않는 이유를 찾아야 했다.

&nbsp; `UserDetails` 타입의 메서드 파라미터는 `AuthenticationPrincipalArgumentResolver`를 사용하기 때문에 디버깅을 통하여 해당 리졸버에서 파라미터가 어떻게 처리되는지 확인해보았다.

### 3. 디버깅을 통한 파라미터 Resolve 과정 확인하기

```java
public interface HandlerMethodArgumentResolver {
    boolean supportsParameter(MethodParameter parameter);

    @Nullable
    Object resolveArgument(MethodParameter parameter, @Nullable ModelAndViewContainer mavContainer, NativeWebRequest webRequest, @Nullable WebDataBinderFactory binderFactory) throws Exception;
}
```

&nbsp; 우선, `AuthenticationPrincipalArgumentResolver`가 구현하고 있는 `HandlerMethodArgumentResolver` 인터페이스에 대해 알 필요가 있다.

&nbsp; `HandlerMethodArgumentResolver`는 2개의 메서드로 구성되어 있다.

- <span class="language-plaintext">booelan supportsParameter(...)</span>: 해당 리졸버가 파라미터를 처리 가능한지 여부를 반환
- <span class="language-plaintext">Object resolveArgument(...)</span>: 해당 리졸버에서 파라미터를 처리하여 바인딩될 값 반환


&nbsp; `AuthenticationPrincipalArgumentResolver`의 각 부분을 살펴보면 아래와 같다.

```java
public final class AuthenticationPrincipalArgumentResolver implements HandlerMethodArgumentResolver {
    
    /* ... */

    public boolean supportsParameter(MethodParameter parameter) {
        return this.findMethodAnnotation(AuthenticationPrincipal.class, parameter) != null;
    }

    /* ... */
}
```

&nbsp; 우선, `supportParameter(...)`에서는 해당 파라미터가 `@AuthenticationPrincipal` 어노테이션을 가지고 있는지를 확인한다. 해당 어노테이션이 붙어있으면 해당 리졸버를 통해 파라미터를 처리하게 된다.

```java
public final class AuthenticationPrincipalArgumentResolver implements HandlerMethodArgumentResolver {
    
    /* ... */

    public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer mavContainer, NativeWebRequest webRequest, WebDataBinderFactory binderFactory) {
        
        // 1. SecurityContext에서 Authentication 객체 가지고 오기
        Authentication authentication = this.securityContextHolderStrategy.getContext().getAuthentication();
        if (authentication == null) {
            return null;
        } else {

            // 2. Authentication 객체에 등록된 Principal 가지고 오기
            Object principal = authentication.getPrincipal();

            // 3. SpEL 표현식을 통하여 특정 필드를 추출하여 Principal로 설정
            AuthenticationPrincipal annotation = (AuthenticationPrincipal)this.findMethodAnnotation(AuthenticationPrincipal.class, parameter);
            String expressionToParse = annotation.expression();
            if (StringUtils.hasLength(expressionToParse)) { 
                StandardEvaluationContext context = new StandardEvaluationContext();
                context.setRootObject(principal);
                context.setVariable("this", principal);
                context.setBeanResolver(this.beanResolver);
                Expression expression = this.parser.parseExpression(expressionToParse);
                principal = expression.getValue(context);
            }

            // 4. 파라미터에 값을 할당 가능한지 여부(타입 등)를 확인한 뒤, 가능할 경우 principal 값을 바인딩
            if (principal != null && !ClassUtils.isAssignable(parameter.getParameterType(), principal.getClass())) {
                if (annotation.errorOnInvalidType()) {
                    throw new ClassCastException("" + principal + " is not assignable to " + parameter.getParameterType());
                } else {
                    return null;
                }
            } else {
                return principal;
            }
        }
    }

    /* ... */
}
```

&nbsp; 파라미터에 값을 바인딩하는 `resolveArgument(...)` 메서드는 코드에 단 주석처럼 동작한다. 

&nbsp; 따라서, 아래와 같은 조건이 만족되어야 `UserDetails` 파라미터에 값이 동작을 하는 것을 알 수 있다.

- `supportParameter(...)`가 true를 응답하여, `AuthenticationPrincipalArgumentResolver`가 리졸버로 사용이 되어야 한다.
- `resolveArgument(...)`에서 SecurityContext에서 가져온 Authentication의 Principal이 메서드 파라미터에 바인딩 가능한 타입이어야 한다.

&nbsp; 위 <u>2가지 조건이 만족되었을 때 값이 정상적으로 바인딩</u>되는 것이다.

&nbsp; 따라서, 해당 메서드들에 breakpoint를 만들어 디버깅을 실시해보기로 하였다.

<img src="/assets/img/docs/web/mvc-security-test/breakpoint-apar.png" alt="breakpoint-apar"/>

&nbsp; 결과적으로 컨트롤러 핸들러 메서드의 인자로 `UserDetails`를 사용한 경우에는 `supportParameter(...)`와 `resolveArgument(...)`가 정상적으로 호출되고 동작하였다. 

&nbsp; 그러나, `CustomUserDetails` 사용 시에는 `supportParameter(...)` 조차 호출되지 않았다.

&nbsp; `supportParameter(...)`가 호출되지 않았다는 것은 <u><span style="font-family: 'JetBrains Mono'; font-size: 14.5px; background-color: rgba(0, 0, 0, .05); border-radius: 3px;">CustomUserDetails</span>를 처리하기 위해 <span style="font-family: 'JetBrains Mono'; font-size: 14.5px; background-color: rgba(0, 0, 0, .05); border-radius: 3px;">AuthenticationPrincipalArgumentResolver</span>가 아닌 다른 리졸버를 사용하고 있다는 것</u>을 의미한다.

### 4. ArgumentResolver 선택 과정 디버깅

&nbsp; 그렇다면, ArgumentResolver가 어떻게 선택이 되는지를 우선적으로 확인해야한다. 

&nbsp; 해당 과정은 `UserDetails`를 사용할 경우 정상적으로 바인딩되는 테스트에서 디버깅을 실시하여 리졸버가 선택되고, 호출되는 메서드들을 역으로 추척하였다.

&nbsp; 아래에서는 메서드 파라미터 리졸버가 어떻게 선택이 되고 사용되는지 과정을 설명한다.

**1\) InvocableHandlerMethod.getMethodArgumentValues()**

```java
public class InvocableHandlerMethod extends HandlerMethod {
    /* ... */
    ❗️ // HandlerMethodArgumentResolver 구현체 리스트를 가지고 있는 클래스 
    private HandlerMethodArgumentResolverComposite resolvers = new HandlerMethodArgumentResolverComposite();
    
    /* ... */

    protected Object[] getMethodArgumentValues(NativeWebRequest request, @Nullable ModelAndViewContainer mavContainer, Object... providedArgs) throws Exception {
        MethodParameter[] parameters = this.getMethodParameters();
        if (ObjectUtils.isEmpty(parameters)) {
            return EMPTY_ARGS;
        } else {
            Object[] args = new Object[parameters.length];

            for(int i = 0; i < parameters.length; ++i) {
                MethodParameter parameter = parameters[i];
                parameter.initParameterNameDiscovery(this.parameterNameDiscoverer);
                args[i] = findProvidedArgument(parameter, providedArgs);
                if (args[i] == null) {
                    ❗️ // 1. Resolver 목록에서 해당 파라미터를 처리 가능한 리졸버가 없으면 예외 발생
                    if (!this.resolvers.supportsParameter(parameter)) {
                        throw new IllegalStateException(formatArgumentError(parameter, "No suitable resolver"));
                    }

                    try {
                        ❗️ // 2. Resolver 목록에서 해당 파라미터를 처리 가능한 리졸버를 통해 파라미터를 처리
                        args[i] = this.resolvers.resolveArgument(parameter, mavContainer, request, this.dataBinderFactory);
                    } catch (Exception var10) {
                        if (logger.isDebugEnabled()) {
                            String exMsg = var10.getMessage();
                            if (exMsg != null && !exMsg.contains(parameter.getExecutable().toGenericString())) {
                                logger.debug(formatArgumentError(parameter, exMsg));
                            }
                        }

                        throw var10;
                    }
                }
            }

            return args;
        }
    }

    /* ... */
}
```

&nbsp; **InvocableHandlerMethod**의 `getMethodArgumentValues(...)`에서 주석으로 표시해놓은 부분이 실제로 파라미터를 리졸브 가능한 ArgumentResolver가 존재하는지 확인하고, 파라미터를 리졸브하는 부분이다.

&nbsp; 여기서 말하는 `HandlerMethodArgumentResolver` 목록이 `HandlerMethodArgumentResolverComposite` 필드이다. 해당 클래스는 `HandlerMethodArgumentResolver` 리스트를 가지고 있다.

**2\) HandlerMethodArgumentResolverComposite** 

```java
public class HandlerMethodArgumentResolverComposite implements HandlerMethodArgumentResolver {
    private final List<HandlerMethodArgumentResolver> argumentResolvers = new ArrayList();
    private final Map<MethodParameter, HandlerMethodArgumentResolver> argumentResolverCache = new ConcurrentHashMap(256);

    /* ... */

    public boolean supportsParameter(MethodParameter parameter) {
        return this.getArgumentResolver(parameter) != null;
    }

    @Nullable
    public Object resolveArgument(MethodParameter parameter, @Nullable ModelAndViewContainer mavContainer, NativeWebRequest webRequest, @Nullable WebDataBinderFactory binderFactory) throws Exception {
        HandlerMethodArgumentResolver resolver = this.getArgumentResolver(parameter);
        if (resolver == null) {
            throw new IllegalArgumentException("Unsupported parameter type [" + parameter.getParameterType().getName() + "]. supportsParameter should be called first.");
        } else {
            return resolver.resolveArgument(parameter, mavContainer, webRequest, binderFactory);
        }
    }

    @Nullable
    public HandlerMethodArgumentResolver getArgumentResolver(MethodParameter parameter) {
        HandlerMethodArgumentResolver result = (HandlerMethodArgumentResolver)this.argumentResolverCache.get(parameter);
        if (result == null) {
            Iterator var3 = this.argumentResolvers.iterator();

            while(var3.hasNext()) {
                HandlerMethodArgumentResolver resolver = (HandlerMethodArgumentResolver)var3.next();
                if (resolver.supportsParameter(parameter)) {
                    result = resolver;
                    this.argumentResolverCache.put(parameter, resolver);
                    break;
                }
            }
        }

        return result;
    }
}
```

&nbsp; **HandlerMethodArgumentResolverComposite**는 `List<HandlerMethodArgumentResolver> argumentResolvers` 필드를 통해 `HandlerMethodArgumentResolver` 리스트를 가지고 있다. 

&nbsp; `supportsParameter(...)`와 `resolveArgument(...)` 모두 해당 클래스 내부의 `getArgumentResolver(MethodParameter parameter)`를 호출하여 특정 파라미터를 리졸브 가능한 리졸버를 획득하는 것을 알 수 있다.

&nbsp; `getArgumentResolver(MethodParameter parameter)` 내부에서는 해당 클래스의 `argumentResolvers` 리스트를 순회하며 각 리졸버의 `supportsParameter(paramter)`를 호출하여 처리 가능한 리졸버를 찾고, 처리 가능한 리졸버가 있을 경우 해당 리졸버를 반환하게 된다.

&nbsp; 위 과정을 정리하면 아래와 같다.

1. `InvocableHandlerMethod.getMethodArgumentValues()`에서 `HandlerMethodArgumentComposite.resolveArgument(...)` 호출

2. `HandlerMethodArgumentResolverComposite` 내 `List<HandlerMethodArgumentResolver>`를 순회하며 각 리졸버의 `supportParameter(...)`를 호출하여 리졸브 가능한 리졸버를 통해 처리

&nbsp; 따라서, `HandlerMethodArgumentResolver.getArgumentResolver(MethodParameter parameter)`를 디버깅하여 각 경우마다 어떠한 리졸버가 할당되는지 확인해보았다.

<img src="/assets/img/docs/web/mvc-security-test/apar-list.png" alt="apar-list" />

&nbsp; 우선, 등록된 `HandlerMethodArgumentResolver` 리스트를 확인하면 30번째에 `AuthenticationPrincipalArgumentResolver`가 위치한 것을 알 수 있다.

&nbsp; 즉, 등록된 리졸버를 순회하면서 `AuthenticationPrincipalArgumentResolver.supportParameter(...)`가 `true`를 반환하게되면 `UserDetails` 파라미터가 처리되게 되는 것이다.

&nbsp; 그렇다면, `CustomUserDetails`를 사용하는 경우는 어떠한 리졸버가 할당되는지 확인해보았다.

<img src="/assets/img/docs/web/mvc-security-test/proxinghmar.png" alt="proxinghmar" />

&nbsp; <span class="underline-highlight"><span class="code">CustomUserDetails</span>를 사용할 경우 <span class="code">AuthenticationPrincipalArgumentResolver</span>가 아닌 <span class="code">ProxingHandlerMethodArgumentResolver</span>를 리졸버로 사용</span>한다. 따라서, `AuthenticationPrincipalArgumentResolver`를 사용하지 않았기 때문에 `CustomUserDetails` 값이 제대로 바인딩 되지 않았던 것이다.

### 5. ProxingHandlerMethodArgumentResolver

&nbsp; 그렇다면, **ProxingHandlerMethodArgumentResolver**는 어떠한 역할을 수행하는 리졸버이기에 `CustomUserDetails`의 리졸버로 선택되는 것일까?

&nbsp; `ProxingHandlerMethodArgumentResolver.supportParameter(MethodParameter parameter)`를 통해 해당 리졸버가 선택되는 이유를 알아보았다.

```java
public class ProxyingHandlerMethodArgumentResolver extends ModelAttributeMethodProcessor implements BeanFactoryAware, BeanClassLoaderAware {
    private static final List<String> IGNORED_PACKAGES = Arrays.asList("java", "org.springframework");

    /* ... */

    public boolean supportsParameter(MethodParameter parameter) {
        if (!super.supportsParameter(parameter)) {
            return false;
        } else {
            Class<?> type = parameter.getParameterType();
            if (!type.isInterface()) {
                return false; // 인터페이스가 아니면 처리 false
            } else if (parameter.getParameterAnnotation(ProjectedPayload.class) != null) {
                return true; 
            } else if (AnnotatedElementUtils.findMergedAnnotation(type, ProjectedPayload.class) != null) {
                return true;
            } else {
                // 해당 파라미터의 패키지가 "java", "org.springframework" 패키지일 경우 false, 아니면 true
                String packageName = ClassUtils.getPackageName(type);
                return !IGNORED_PACKAGES.stream().anyMatch((it) -> {
                    return packageName.startsWith(it);
                });
            }
        }
    }

    /* ... */
}
```

> **ProxingHandlerMethodArgumentResolver**는 Spring-Data-Commons 프로젝트에 포함된 리졸버로, 인터페이스로 정의된 파라미터에 대해 구현체가 없더라도 프록시 객체를 자동으로 생성해주는 역할을 수행한다. <br/><br/>
이를 통하여 불필요한 객체(구현체) 생성을 줄이고 다형성을 지원한다.

&nbsp; 위 코드를 통해 `ProxingHandlerMethodArgumentResolver`가 리졸버로 선택되는 경우는 다음과 같다.

- 파라미터가 <u>인터페이스</u>이면서
- <u>java와 spring에 기본적으로 포함된 패키지가 아닐 경우</u>

&nbsp; `CustomUserDetails`는 <u>인터페이스</u>이며, <u>Java와 Spring에 기본적으로 포함된 패키지가 아닌 직접 정의한 인터페이스</u>이므로 해당 조건에 부합하여 true를 응답하게 되어 해당 리졸버가 선택된 것이다.

&nbsp; `UserDetails`도 인터페이스이지만, <u>Spring-Security에서 제공하는 인터페이스이므로 패키지가 "org.springframework"로 시작</u>하므로 false를 반환하여 해당 리졸버가 선택되지 않게되는 것이다.

### 6. SecurityAutoConfiguration

&nbsp; 위 리졸버 목록에서 `ProxingHandlerMethodArgumentResolver`가 `AuthenticationPrincipalArgumentResolver`보다 앞쪽에 위치하고 있어 `CustomUserDetails` 사용 시 `AuthenticationPrincipalArgumentResolver`에 도달하지 못하여 잘못된 리졸버가 선택된다는 것을 알 수 있었다.

&nbsp; 그렇다면, `@EnableWebSecurity` 클래스를 Import 하게 된다면 왜 `CustomUserDetails`더라도 제대로 동작하는 것일까? 

&nbsp; 이 이유를 확인해보기 위해 `DummySecurityConfig` 클래스를 Import 한 뒤 다시 디버깅을 진행하였다.

<img src="/assets/img/docs/web/mvc-security-test/apar-list-2.png" alt="apar-list-2" />

&nbsp; 해당 경우에서는 `AuthenticationPrincipalArgumentResovler`가 `ProxingHandlerMethodArgumentResolver`보다 앞에 위치한 것을 알 수 있다. 따라서, `CustomUserDetails`를 사용하더라도 `AuthenticationPrincipalArgumentResolver.supportParameter(...)`를 먼저 호출하게 되어 문제없이 바인딩이 진행된 것이다.

&nbsp; 즉, <u><span class="language-plaintext">@EnableWebSecurity</span> 클래스의 Import 여부에 따라 ArgumentResolver가 등록되는 순서가 달라진다</u>.

&nbsp; 해당 문제는 <span class="underline-highlight" style="font-weight: bold;">SecurityAutoConfiguration</span> 차이에 의해 발생한다.

&nbsp; SpringSecurity 사용 시 사용자가 직접 `@EnableWebSecurity` 클래스를 정의하지 않을 경우, `SecurityAutoConfiguration`에 의해 자동으로 FilterChain과 기타 설정을 등록하게 된다.

&nbsp; `@WebMvcTest` 시 `@Configuration` 클래스는 로드되지 않기 때문에 사용자가 정의한 Security 설정이 아닌 `SecurityAutoConfiguration`을 통해 설정이 진행된다. 따라서, `SecurityAutoConfiguration`을 사용하는 경우 `AuthenticationPrincipalArgumentResolver`가 등록되는 순서가 뒤로 밀리게 되는 것이다.

&nbsp; 이를 확인하기 위해서 테스트에서 `SecurityAutoConfiguration` 설정을 제거한 후 ArgumentResolver를 확인해보면 다음과 같다.

```java
@WebMvcTest(
        controllers = TestController.class,
        excludeAutoConfiguration = SecurityAutoConfiguration.class, // SecurityAutoConfiguration 제거
        excludeFilters = {
                @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE, classes = {OncePerRequestFilter.class})
        }
)
public class TestControllerTest {
    /* ... */
}
```

<div style="display: flex; justify-content: center;">
    <img src="/assets/img/docs/web/mvc-security-test/al-without-securityautoconfig.png" alt="al-without-securityautoconfig" style="margin: 0 auto;" />
</div>

&nbsp; SecurityAutoConfiguration을 제거하면 Security 관련 리졸버들이 등록되지 않기 때문에 `AuthenticationPrincipalArgumentResolver`가 목록 내 존재하지 않는다.

### 7. SecurityAutoConfiguration

&nbsp; 그렇다면, `SecurityAutoConfiguration`은 어떻게 자동으로 설정을 진행하는지 해당 과정을 확인해보았다.

```java
@AutoConfiguration(
    before = {UserDetailsServiceAutoConfiguration.class}
)
@ConditionalOnClass({DefaultAuthenticationEventPublisher.class})
@EnableConfigurationProperties({SecurityProperties.class})
@Import({SpringBootWebSecurityConfiguration.class, SecurityDataConfiguration.class})
public class SecurityAutoConfiguration {
    public SecurityAutoConfiguration() {
    }

    @Bean
    @ConditionalOnMissingBean({AuthenticationEventPublisher.class})
    public DefaultAuthenticationEventPublisher authenticationEventPublisher(ApplicationEventPublisher publisher) {
        return new DefaultAuthenticationEventPublisher(publisher);
    }
}
```

&nbsp; `SecurityAutoConfiguration`에서는 `SpringBootWebSecurityConfiguration.class`를 Import한다.

```java
@Configuration(
    proxyBeanMethods = false
)
@ConditionalOnWebApplication(
    type = Type.SERVLET
)
class SpringBootWebSecurityConfiguration {
    SpringBootWebSecurityConfiguration() {
    }

    @Configuration(
        proxyBeanMethods = false
    )
    @ConditionalOnMissingBean(
        name = {"springSecurityFilterChain"}
    )
    @ConditionalOnClass({EnableWebSecurity.class})
    @EnableWebSecurity
    static class WebSecurityEnablerConfiguration {
        WebSecurityEnablerConfiguration() {
        }
    }

    @Configuration(
        proxyBeanMethods = false
    )
    @ConditionalOnDefaultWebSecurity
    static class SecurityFilterChainConfiguration {
        SecurityFilterChainConfiguration() {
        }

        @Bean
        @Order(2147483642)
        SecurityFilterChain defaultSecurityFilterChain(HttpSecurity http) throws Exception {
            http.authorizeHttpRequests((requests) -> {
                ((AuthorizeHttpRequestsConfigurer.AuthorizedUrl)requests.anyRequest()).authenticated();
            });
            http.formLogin(Customizer.withDefaults());
            http.httpBasic(Customizer.withDefaults());
            return (SecurityFilterChain)http.build();
        }
    }
}
```

&nbsp; `SpringBootWebSecurityConfiguration`에서는 기본 FilterChain을 등록하고, `@EnableWebSecurity` 클래스를 임의로 등록한다.

```java
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.TYPE})
@Documented
@Import({WebSecurityConfiguration.class, SpringWebMvcImportSelector.class, OAuth2ImportSelector.class, HttpSecurityConfiguration.class})
@EnableGlobalAuthentication
public @interface EnableWebSecurity {
    boolean debug() default false;
}
```

&nbsp; `@EnableWebSecurity` 어노테이션에서는 `SpringWebMvcImportSelector`를 Import한다.

```java
class SpringWebMvcImportSelector implements ImportSelector {
    private static final boolean webMvcPresent;

    SpringWebMvcImportSelector() {
    }

    public String[] selectImports(AnnotationMetadata importingClassMetadata) {
        return !webMvcPresent ? new String[0] : new String[]{"org.springframework.security.config.annotation.web.configuration.WebMvcSecurityConfiguration"};
    }

    static {
        ClassLoader classLoader = SpringWebMvcImportSelector.class.getClassLoader();
        webMvcPresent = ClassUtils.isPresent("org.springframework.web.servlet.DispatcherServlet", classLoader);
    }
}
```

&nbsp; `SpringWebMvcImportSelector`에서는 static 블록 내에서 로드된 클래스들 중 DispatcherServlet이 존재할 경우(=Spring MVC 애플리케이션일 경우), `WebMvcSecurityConfigratuion`을 동적으로 Import한다.

<img src="/assets/img/docs/web/mvc-security-test/webMvcSecurityConfiguration.png" alt="webMvcSecurityConfiguration">

&nbsp; `WebMvcSecurityConfiguration`에서 `AuthenticationPrincipalArgumentResolver`를 등록하는 것을 확인할 수 있다.

### 8. WebMvcConfigurerComposite

&nbsp; 그렇다면, `WebMvcSecurityConfiguration.addArgumentResolver()`를 호출하는 클래스의 메서드를 역으로 따라가면 리졸버가 등록되는 순서를 알 수 있을 것이다.

&nbsp; `WebMvcSecurityConfiguration.addArgumentResolvers()`는 **WebMvcConfigurerComposite** 의 `addArgumentResolvers(List<HandlerMethodArgumentResolver> argumentResolvers)`에서 호출된다.

```java
class WebMvcConfigurerComposite implements WebMvcConfigurer {
    private final List<WebMvcConfigurer> delegates = new ArrayList();

    /* ... */

    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> argumentResolvers) {
        Iterator var2 = this.delegates.iterator();

        while(var2.hasNext()) {
            WebMvcConfigurer delegate = (WebMvcConfigurer)var2.next();
            delegate.addArgumentResolvers(argumentResolvers);
        }

    }

    /* ... */
}
```

&nbsp; 위를 통해 결국 <u><span class="language-plaintext">WebMvcConfigurer</span> 구현체들의 순서에 따라서 각 Configurer의 <span class="language-plaintext">addArgumentResolvers(argumentResolvers)</span>가 호출되는 시점이 달라지게 되어 ArgumentResolver의 순서 차이가 발생</u>한 것을 알 수 있다.

&nbsp; 또한, 해당 메서드는 **DelegatingWebMvcConfiguration**의 `setConfigurers(List<WebMvcConfigurer> configurers)`에 의해서 호출된다.

```java
@Configuration(
    proxyBeanMethods = false
)
public class DelegatingWebMvcConfiguration extends WebMvcConfigurationSupport {
    private final WebMvcConfigurerComposite configurers = new WebMvcConfigurerComposite();

    public DelegatingWebMvcConfiguration() {
    }

    @Autowired(
        required = false // WebMvcConfigurer 타입의 빈들을 찾지 못해도 오류 발생을 막기 위함
    )
    public void setConfigurers(List<WebMvcConfigurer> configurers) {
        if (!CollectionUtils.isEmpty(configurers)) {
            this.configurers.addWebMvcConfigurers(configurers);
        }

    }

    /* ... */
}
```

&nbsp; `setConfigurers` 메서드는 `@Autowired` 어노테이션이 붙어져있다. 즉, `WebMvcConfigurer`의 구현체인 Bean들을 주입받아 Configurer로 등록하는 것이다.

&nbsp; 더 나아가 Configurer 등록되는 과정은 디버깅을 통하여 확인하였지만, 어떤 순서로 등록되는지에 관한 내용은 아직 명확하지 않고 내용이 많기도하여 다른 포스팅에서 기회가 된다면 다뤄볼 계획이다.

## 해결 방법

&nbsp; `CustomUserDetails` + `@WebMvcTest` 사용 시 메서드 파라미터에 값이 바인딩되지 않는 문제를 해결하기 위해 앞서 문제 발생 이유를 통해 찾은 내용을 바탕으로 해결하는 방법과 그렇지 않은 방법 몇 가지를 고민해보았다.

### 1. standaloneSetup

&nbsp; 먼저, MockMvc 객체 생성 시 `MockMvcBuilder.webAppContextSetup()`가 아닌 `MockMvcBuilders.standaloneSetup()`을 사용하는 방법이다.

```java
@BeforeEach
void setup() {
    AuthenticationPrincipalArgumentResolver authenticationPrincipalArgumentResolver = new AuthenticationPrincipalArgumentResolver();
    
    this.mockMvc = MockMvcBuilders.standaloneSetup(new TestController()) // 테스트할 컨트롤러 인스턴스
            .setCustomArgumentResolvers(authenticationPrincipalArgumentResolver) // 리졸버 등록
            .setMessageConverters(new StringHttpMessageConverter(StandardCharsets.UTF_8))
            .alwaysDo(print())
            .build();
}
```

&nbsp; 해당 방법은 Presentation 레이어의 여러 빈들을 자동으로 로드하는 것이 아닌 테스트할 특정 콘트롤러 클래스만을 대상으로 하여 테스트를 진행하는 방법이다.

&nbsp; 따라서, 기타 설정들을 로드되지 않기 때문에 직접 `AuthenticationPrincipalArgumentResolver`를 등록하여야 한다.

&nbsp; 그러나 이 외에도 ArgumentResolver, 메시지 컨버터를 직접 등록하여야 하거나 Filter들도 로드되지 않기 때문에 `springSecurity()` 설정이 아닌 SecurityContext를 사용해 직접 `userDetails`를 설정해야하는 등의 번거로움이 있다.

### 2. DummySecurityConfig

&nbsp; 앞서 언급한 것과 같이 `@EnableWebSecurity` 설정을 사용해 `AuthenticationPrincipalArgumentResolver`의 위치를 `ProxingHanlderMethodArgumentResolver`보다 앞에 위치하도록 하여 해결하는 방법이다.

&nbsp; 해당 방법은 테스트를 위한 별도의 클래스를 생성하여야하고, 매번 Import가 필요하는 등의 비용이 발생한다.

### 3. UserDetails 인자 사용 후 타입 캐스팅

&nbsp; 앞서 `UserDetails`에 대해서는 문제없이 값이 제대로 바인딩되는 것을 확인하였다. 따라서, `UserDetails userDetails`를 메서드 파라미터로 사용한 뒤 컨트롤러 메서드 내에서 타입 캐스팅하여 필요한 필드를 추출하여 사용하는 방법이다.

&nbsp; 해당 방법은 컨트롤러 클래스 내에서 타입 캐스팅 과정을 거쳐야하기 때문에 그리 좋은 방법이라 생각치는 않는다.

### 4. SpEL을 사용한 필드값 바인딩

&nbsp; `@AuthenticationPrincipal` 어노테이션에서는 [expression](https://github.com/spring-projects/spring-security/blob/e37424c6374ceb150419768a1b2cf2ce2f37e507/core/src/main/java/org/springframework/security/core/annotation/AuthenticationPrincipal.java#L76) 옵션을 제공한다.

&nbsp; 이는 사용자 정의 UserDetails를 사용하는 경우 Getter를 통해 특정 필드값을 바로 바인딩받기 위한 옵션이다. `AuthenticationPrincipalArgumentResolver`에서도 [SpEL을 통해 값을 바인딩 받을 수 있는 것](https://github.com/spring-projects/spring-security/blob/e37424c6374ceb150419768a1b2cf2ce2f37e507/web/src/main/java/org/springframework/security/web/method/annotation/AuthenticationPrincipalArgumentResolver.java#L126)을 확인할 수 있다.

&nbsp; 그러나, 사용자 정의 `UserDetails` 구현체에는 주로 사용자 객체(User) 자체를 필드로 사용하는 경우가 많기 때문에 해당 방법은 불필요한 나머지 필드도 바인딩 받게 되는 문제가 있다.

### 5. 컨트롤러 핸들러 메서드의 인자로 구현체 사용

&nbsp; `ProxingHandlerMethodArgumentResolver`에서는 <u>인터페이스</u>이고, <u>java나 spring에 내장되어 있는 인터페이스가 아닌 경우</u> 해당 파라미터를 리졸브하게 된다.

&nbsp; 즉, 인터페이스가 아니라면 해당 리졸버를 사용하지 않게 되는 것이다.

&nbsp; 따라서, 컨트롤러 핸들러 메서드의 인자로 구현체를 사용하여 `ProxingHandlerMethodArgumentResolver`를 우회하는 방법이다.

```java
@RestController
public class TestController {

    @GetMapping("/test")
    public ResponseEntity<?> getTest(@AuthenticationPrincipal CustomUserDetailsImpl userDetails) {
        System.out.println("user Id : " + userDetails.getUserId());
        System.out.println("user : " + userDetails);
        System.out.println("user name : " + userDetails.getUsername());
        return ResponseEntity.ok("success");
    }
}
```

&nbsp; 그러나, `CustomUserDetails`는 다형성을 활용하여 여러 역할의 사용자에 대비하기 위하여 정의한 인터페이스이기에 `CustomUserDetailsImpl` 구현체를 바인딩받게 된다면 그 의미가 옅어질 수 있다고 생각한다. 또한, 각 사용자에 대한 구현체에는 별도의 필드가 정의되어 있는 상태에서 하나의 엔드포인트로 요청을 보내야하는 상황이 있다면 구현체의 사용하는데 문제가 발생할 것이다. 그렇지 않은 상황이라면 좋은 해결책이라 생각한다.

## Spring Security Github Issue

&nbsp; 나는 위 문제를 근본적으로 해결하기 위하여 2가지 방법을 생각하였다.

- <span class="language-plaintext">ProxingHandlerMethodArgumentResolver</span>에서 예외에 포함될 패키지를 직접 추가하는 방식
- SecurityAutoConfiguration을 사용하더라도, <span class="language-plaintext">SpringWebDataConfiguration</span>보다 <span class="language-plaintext">WebMvcSecurityConfiguration</span>을 먼저 등록하기

&nbsp; 전자는 Spring Data 프로젝트와 직접적으로 연관된 해결 방법이며, 후자는 Spring Security와 연관된 해결 방법이다.

&nbsp; 필자는 우선 해당 내용 자체가 Spring Security 테스트를 진행하며 발생한 일이기 때문에 Spring Security Github에 bug 이슈를 남기기로 하였다.

<i class="fas fa-link"></i> [Github Issue - Fail resolve argument CustomUserDetails when I test in only SecurityAutoConfiguration and @WebMvcTest](https://github.com/spring-projects/spring-security/issues/17383)

<img src="/assets/img/docs/web/mvc-security-test/github-issue.png" alt="issue" />

# 결론

&nbsp; 해당 문제를 해결해나가는데 굉장히 오랜 시간이 걸렸다. 

&nbsp; 관련된 내용이 stackoverflow나 github issue 등 에서도 확인할 수가 없어 breakpoint를 여러 개 설정하여 직접 디버깅을 해보는 수 밖에 없었다.

&nbsp; 트러블 슈팅 과정에서 디버깅에 대해 더 익숙해진 것 같은 느낌이 든다. 메서드를 역으로 추척하는 과정을 겪으며 각 값을 확인하고, 특정 객체에 할당된 값을 바꾸어 동작을 확인하는 등의 작업을 거치며 일일히 확인하였다.

&nbsp; 본 포스팅에서 문제를 해결하기 위한 몇 가지 방안을 제시하였지만 결국 본질적인 문제가 해결되었다고 보기는 어렵다.

&nbsp; 현재는 단순 테스트 과정이기에 테스트 자체에 실패는 일어나지 않지만, 결국 사용자가 커스텀한 인터페이스 파라미터가 `ProxingHandlerMethodArgumentResolver`에 의해 값 바인딩이 제대로 되지 않는 문제는 차후 다른 문제로 이어질 수도 있으리라 생각한다.

&nbsp; Spring Security의 깃허브 이슈를 제기한 뒤, 나도 `WebMvcConfigurer`의 구현체들이 등록되는 과정을 다시 면밀히 살펴보면서 해당 순서를 조정하는 방법이 있을지에 대해 고민해볼 것이다.

&nbsp; 특히, Spring Security는 SelectImportor를 통해 동적으로 `WebMvcSecurityConfiguration`을 `@Configuration` 클래스로 등록하는 과정이 복잡하다. 해당 내용도 차후 정리하여 포스팅을 작성하면 좋겠다고 생각한다.

&nbsp; 해당 과정을 겪으며 단순히 근본적인 문제가 발생하는 상황을 모른체 해결하는 것이 아닌 문제 발생 상황을 인식하고 이를 분석하여 여러가지 해결 방안을 고안한 경험은 정말 값진 경험이라 생각한다.


