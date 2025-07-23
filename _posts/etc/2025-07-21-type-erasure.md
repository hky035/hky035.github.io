---
layout: posts
title: 'Java Generic Type Erasure'
author_profile: true
sidbar:
   nav: 'main'
category: 'etc'
description: 'DTO에 대한 정적 팩토리 메서드를 구성하던 중 메서드 오버로딩을 통해 List를 인자로 받게 되었다. 제너릭 부분에 위치한 타입이 다르기 때문에 메서드 오버로딩이 가능할 것이라고 생각했지만 인텔리제이에서 예상치못한 오류를 만나게 되었다. Java의 타입 소거(Tryp Erasure)에 의해 발생하는 문제로, 해당 문제를 분석하며 알게된 정보들을 공유하고자 한다.'
published: true
show_date: true
---

# 서론

&nbsp; 여행 기록 관리 플랫폼 프로젝트를 진행하던 중 DTO에 대한 정적 팩토리 메서드를 작성하였다. 

```java
@Builder
    public record TripSummary(
            Long tripId,
            String title,
            String city,
            Long leaderId,
            LocalDateTime startedAt,
            LocalDateTime endedAt,
            TravelStatus status,
            List<TripMemberRes.MemberInfo> members
    ) {
        public static TripSummary from(Trip trip, List<User> members) {
            return TripSummary.builder()
                    .tripId(trip.getId())
                    .title(trip.getTitle())
                    .city(trip.getCity())
                    .leaderId(trip.getLeaderId())
                    .startedAt(trip.getStartedAt())
                    .endedAt(trip.getEndedAt())
                    .status(trip.getTravelStatus())
                    .members(members.stream().map(TripMemberRes.MemberInfo::fromEntity).toList())
                    .build();
        }
    }
```

&nbsp; 해당 DTO는 여행의 요약 정보를 나타내는 DTO이다. 여행 엔티티 `Trip`과 여행 멤버 목록 `List<User>`를 인자로 받아 `TripSummary` DTO를 반환하는 정적 팩토리 메서드를 가지고 있다. 

&nbsp; 영속성 계층의 사용 기술을 Spring-Data-JPA에서 QueryDSL로 일부 마이그레이션하는 과정에서, 기존에는 사용자가 속한 모든 여행의 요약 정보를 조회할 때 여행 수 만큼 n번의 여행 멤버를 찾는 쿼리가 발생하는 문제를 확인하였다. 따라서 해당 부분을 QueryDSL로 마이그레이션하면서 Projection을 통해 DTO 타입의 엔티티를 가져와 바로 반환하는 형식으로 리팩토링하기로 하였다.

&nbsp; 이 과정에서 `from()` 메서드의 인자값으로 `User` 엔티티 뿐만 아니라 `TripMemberRes.MemberInfo`를 List의 제너릭 타입에 위치시켜 메서드 오버로딩이 되도록 코드를 작성하였다.

&nbsp; 그러나, 이 과정에서 아래와 같은 에러 문구를 확인하였다.

```java
@Builder
    public record TripSummary(
            Long tripId,
            String title,
            String city,
            Long leaderId,
            LocalDateTime startedAt,
            LocalDateTime endedAt,
            TravelStatus status,
            List<TripMemberRes.MemberInfo> members
    ) {
        public static TripSummary from(Trip trip, List<User> members) {
            return TripSummary.builder()
                    .tripId(trip.getId())
                    .title(trip.getTitle())
                    .city(trip.getCity())
                    .leaderId(trip.getLeaderId())
                    .startedAt(trip.getStartedAt())
                    .endedAt(trip.getEndedAt())
                    .status(trip.getTravelStatus())
                    .members(members.stream().map(TripMemberRes.MemberInfo::fromEntity).toList())
                    .build();
        }

        public static TripSummary from(Trip trip, List<TripMemberRes.MemberInfo> members) {
            return TripSummary.builder()
                    .tripId(trip.getId())
                    .title(trip.getTitle())
                    .city(trip.getCity())
                    .leaderId(trip.getLeaderId())
                    .startedAt(trip.getStartedAt())
                    .endedAt(trip.getEndedAt())
                    .status(trip.getTravelStatus())
                    .members(members)
                    .build();
        }
    }
```

<img src="/assets/img/docs/etc/type-erasure/same-erasure-error.png" alt="same-erasure-error" />

&nbsp; 해당 에러 문구의 내용은 `from(Trip, List<User>)`와 `from(Trip, List<MemberInfo>)` 간에 타입 소거(Type erasure)로 인해 충돌이 발생한다는 것이다.

&nbsp; 여기서 말하는 타입 소거는 `List<>`의 제너릭 부분에 위치한 `<User>`와 `<MemberInfo>`가 소거되어 동일한 Raw 타입의 List라고 인식하는 것이다. 이는 메서드의 이름과 인자가 모두 동일하다고 판단하여 메서드 오버로딩이 불가능하도록 만든다. 바이트 코드를 분석하여 해당 문제가 발생하는 기전과 동작에 대해 알아보고자 한다.

# Type Erasure

&nbsp; 타입 소거는 앞서 설명한 것과 같이 List의 제너릭 타입이 사라져 Raw 타입의 List로 인식하여 발생하는 문제이다.

&nbsp; 아래는 `List<String>` 타입이 바이트 코드에서 어떻게 나타나는지를 확인하기 위한 간단한 코드이다.

```java
public class GenericTest {
    private List<String> fruits = new ArrayList<>();
    
    public void setFruits(List<String> fruits) {
        this.fruits = fruits;
    }
    
    public List<String> getFruits() {
        return this.fruits;
    }
}
```

```java
Compiled from "GenericTest.java"
public class blog.GenericTest {
  public blog.GenericTest();
    Code:
       0: aload_0
       1: invokespecial #1                  // Method java/lang/Object."<init>":()V
       4: aload_0
       5: new           #7                  // class java/util/ArrayList
       8: dup
       9: invokespecial #9                  // Method java/util/ArrayList."<init>":()V
      12: putfield      #10                 // Field fruits:Ljava/util/List;
      15: return

  public void setFruits(java.util.List<java.lang.String>);
    Code:
       0: aload_0
       1: aload_1
       2: putfield      #10                 // Field fruits:Ljava/util/List;
       5: return

  public java.util.List<java.lang.String> getFruits();
    Code:
       0: aload_0
       1: getfield      #10                 // Field fruits:Ljava/util/List;
       4: areturn
}
```

```java
Constant pool: // 상수풀
   #1 = Methodref          #2.#3          // java/lang/Object."<init>":()V
   #2 = Class              #4             // java/lang/Object
   #3 = NameAndType        #5:#6          // "<init>":()V
   #4 = Utf8               java/lang/Object
   #5 = Utf8               <init>
   #6 = Utf8               ()V
   #7 = Class              #8             // java/util/ArrayList
   #8 = Utf8               java/util/ArrayList
   #9 = Methodref          #7.#3          // java/util/ArrayList."<init>":()V
  #10 = Fieldref           #11.#12        // blog/GenericTest.fruits:Ljava/util/List;
  #11 = Class              #13            // blog/GenericTest
  #12 = NameAndType        #14:#15        // fruits:Ljava/util/List;
  #13 = Utf8               blog/GenericTest
  #14 = Utf8               fruits
  #15 = Utf8               Ljava/util/List;
  #16 = Utf8               Signature
  #17 = Utf8               Ljava/util/List<Ljava/lang/String;>;
  #18 = Utf8               Code
  #19 = Utf8               LineNumberTable
  #20 = Utf8               setFruits
  #21 = Utf8               (Ljava/util/List;)V
  #22 = Utf8               (Ljava/util/List<Ljava/lang/String;>;)V
  #23 = Utf8               getFruits
  #24 = Utf8               ()Ljava/util/List;
  #25 = Utf8               ()Ljava/util/List<Ljava/lang/String;>;
  #26 = Utf8               SourceFile
  #27 = Utf8               GenericTest.java
```

&nbsp; 위 코드에서 `List<String> fruits` 멤버 변수에 대한 필드 참조 값(#10)이 `java/util/List`와 같이 Raw 타입의 리스트를 가르키고 것을 확인할 수 있다. 이것이 **타입 소거(Type Erasure)**가 발생된 것이다.

&nbsp; 즉, List에서는 제너릭이 타입 소거가 되어 Raw 타입의 List만 남게된다. 

&nbsp; 그런데, `public void setFruits(java.util.List<java.lang.String>);` 부분에서 인자 부분에 List의 제너릭 정보가 나타나는 것을 알 수 있다. 이는 자바 컴파일러가 제너릭 타입에 대해 저장하는 정보인 **Signature Attribute(시그니처 속성)**과 연관이 있다.

### Signature Attribute

&nbsp; 제너릭 타입의 정보를 저장하는 공간으로, 자바 런타임시에는 사용되지 않지만 컴파일러나 리플렉션을 통해 제너릭 타입의 정보를 활용해야 할 때 각 도구들이 이를 참조할 수 있다.

### Generic Signature

&nbsp; 자바 컴파일러가 Signature Attribute로 남기는 제너릭 타입의 정보를 나타내는 용어로, 해당 정보를 통해 컴파일러나 리플렉션 활용 시 제너릭 타입의 관계 파악이 가능하다.

<br />

&nbsp; 이와 같이 `public void setFruits(java.util.List<java.lang.String>);` 부분은 단지 Generic Signature를 통해 자바 컴파일러가 메서드의 인자 정보 적용시킨 것임을 알 수 있다. 

&nbsp; 그렇다면, 실제로 해당 메서드의 인자로 Raw 타입의 List로 받는지 확인하는 방법은 해당 메서드를 호출해보면 된다.

```java
public static void main(String[] args) {
    GenericTest test = new GenericTest();
    List<String> strList = new ArrayList<>();
    strList.add("apple");
    
    test.setFruits(strList);
}
```

```java
public static void main(java.lang.String[]);
Code:
    0: new           #11                 // class blog/GenericTest
    3: dup
    4: invokespecial #16                 // Method "<init>":()V
    7: astore_1
    8: new           #7                  // class java/util/ArrayList
    11: dup
    12: invokespecial #9                  // Method java/util/ArrayList."<init>":()V
    15: astore_2
    16: aload_2
    17: ldc           #17                 // String apple
    19: invokeinterface #19,  2           // InterfaceMethod java/util/List.add:(Ljava/lang/Object;)Z
    24: pop 
    25: aload_1
    26: aload_2
    27: invokevirtual #25                 // Method setFruits:(Ljava/util/List;)V
    30: return
```

&nbsp; `27:invokevirtual` 라인을 보면 `setFruits:(Ljava/util/List;)V`와 같이 Raw 타입의 List가 인자로 사용된 것을 알 수 있다.

&nbsp; 이를 통해 **"List 타입의 인자는 타입 소거에 의해 제너릭 부분이 소거되기 때문에 동일한 메서드로 인식되어 컴파일이 실패한 것"**임을 알 수 있다.

## 타입 소거의 이유

&nbsp; 위 과정에서 결국 Generic Signature(제너릭에 대한 정보)를 저장하는데 굳이 타입 소거를 통해서 Raw 타입으로 컴파일되는 이유가 뭘까?

&nbsp; 우선, Java5 이전에는 제너릭이 존재하지 않았기에 List와 같은 컬렉션 프레임워크도 Raw 타입을 사용하였다. 따라서, 기존의 Raw 타입을 사용하는 이전 버전의 바이트 코드와의 하위 호환성을 유지하기 위해 컴파일 시점에서 타입 소거를 진행하는 것이다.

&nbsp; 또한, 제너릭은 컴파일 시점에서 타입 안정성(Compile-time Type Safety)을 보장하는 역할을 하지만, 런타임시에는 여러 타입이 호환될 수 있다는 점이 오버헤드로 이어질 수 있다. 따라서, 런타임 시에는 타입 소거를 통하여 제너릭 부분을 제거하여 오버헤드를 줄이는 것이다.

## 타입 소거 후 Object 클래스 치환

&nbsp; 컬렉션 프레임워크나 Map과 같은 자료구조에서는 Raw 타입으로 치환이 된다. 그렇다면 사용자가 정의한 제너릭 클래스가 컴파일되는 과정에서는 제너릭이 어떻게 소거가 될까?

```java
public class A <T> {
    private T value;
    
    public A(T value) {
        this.value = value;
    }
    
    public T getValue() {
        return this.value;
    }
    
    public void print1() {
        System.out.println(value);
    }
    
    public <V> void print2(V value) {
        System.out.println(value);
    }
}
```

&nbsp; 위 코드는 제너릭 타입 `<T>`를 사용하는 제너릭 클래스이다. 생성자와 `value`를 반환하고 출력하는 메서드와 클래스 수준의 제너릭이 아닌 메서드 수준에서 적용되는 별도의 제너릭 `V value`를 출력하는 제너릭 메서드도 포함하고 있다. 해당 코드의 바이트 코드는 아래와 같다.

```java
Compiled from "A.java"
public class blog.A<T> {
  public blog.A(T);
    Code:
       0: aload_0
       1: invokespecial #1                  // Method java/lang/Object."<init>":()V
       4: aload_0
       5: aload_1
       6: putfield      #7                  // Field value:Ljava/lang/Object;
       9: return

  public T getValue();
    Code:
       0: aload_0
       1: getfield      #7                  // Field value:Ljava/lang/Object;
       4: areturn

  public void print1();
    Code:
       0: getstatic     #13                 // Field java/lang/System.out:Ljava/io/PrintStream;
       3: aload_0
       4: getfield      #7                  // Field value:Ljava/lang/Object;
       7: invokevirtual #19                 // Method java/io/PrintStream.println:(Ljava/lang/Object;)V
      10: return

  public <V> void print2(V);
    Code:
       0: getstatic     #13                 // Field java/lang/System.out:Ljava/io/PrintStream;
       3: aload_1
       4: invokevirtual #19                 // Method java/io/PrintStream.println:(Ljava/lang/Object;)V
       7: return
}
```

&nbsp; 위 코드에서 클래스 수준에 사용되는 제너릭 `T value` 필드에 대해 `Object` 타입으로 치환된다는 것을 알 수 있다. 또한, 메서드 수준의 사용되는 제너릭 `V value`에 대해서도 Object로 치환됨을 알 수 있다.

&nbsp; 이렇듯 기본적으로 제너릭은 `Object`로 치환된다. 

&nbsp; 어찌보면 당연한 이야기인 것이 타입이 소거된다고 하더라도 결국 컴파일이되고, 해당 프로그램을 실행할 때 타입이 정의되어 있어야 해당 필드를 참조하고 객체로 사용이 가능하기 때문이다. 결국, 모든 타입의 부모 클래스인 `Object`로 치환되어 어떠한 클래스가 오더라도 해당 값을 받을 수 있게 되는 것이다.

&nbsp; 그렇다고해서 모든 제너릭이 `Object`로 치환되는 것은 아니다. [Oracle Java 공식문서](https://docs.oracle.com/javase/tutorial/java/generics/erasure.html)에 따르면, <u>unbounded parameter는 Object로 치환이 되며, bound가 되어있는 타입에 대해서는 bound 타입의 파라미터로 치환된다</u>고 한다.

&nbsp; 여기서 bound는 `<T extends Parent>`와 같이 제너릭 타입을 상위 타입 `Parent`로 한정하는 등의 작업을 의미한다.

```java
public class B <T extends Parent> {
    T value;
    
    public B(T value) {
        this.value = value;
    }
    
    public T getValue() {
        return this.value;
    }
    
    public void print1() {
        System.out.println(value);
    }
    
    public <V> void print2(V value) {
        System.out.println(value);
    }
}
```

```java
Compiled from "B.java"
public class blog.B<T extends blog.Parent> {
  T value;

  public blog.B(T);
    Code:
       0: aload_0
       1: invokespecial #1                  // Method java/lang/Object."<init>":()V
       4: aload_0
       5: aload_1
       6: putfield      #7                  // Field value:Lblog/Parent;
       9: return

  public T getValue();
    Code:
       0: aload_0
       1: getfield      #7                  // Field value:Lblog/Parent;
       4: areturn

  public void print1();
    Code:
       0: getstatic     #13                 // Field java/lang/System.out:Ljava/io/PrintStream;
       3: aload_0
       4: getfield      #7                  // Field value:Lblog/Parent;
       7: invokevirtual #19                 // Method java/io/PrintStream.println:(Ljava/lang/Object;)V
      10: return

  public <V> void print2(V);
    Code:
       0: getstatic     #13                 // Field java/lang/System.out:Ljava/io/PrintStream;
       3: aload_1
       4: invokevirtual #19                 // Method java/io/PrintStream.println:(Ljava/lang/Object;)V
       7: return
}
```

&nbsp; 다음은 `Parent` 타입으로 한정된 제너릭을 가지는 제너릭 클래스 `B`의 바이트 코드이다. 클래스 내부의 구조는 `A` 클래스와 동일하다.

&nbsp; 바이트 코드에서 알 수 있듯이 생성자에서 `T value` 필드는 `Parent` 타입으로 치환된 것을 알 수 있다. `T getValue()` 메서드 내에서도 `T value`를 `Parent` 타입으로 가져온다. 

&nbsp; `print1()` 메서드 내에서 `4: getfield` 부분에서는 `Parent`로 `value`를 가져오지만 `println:(Ljava/lang/Object;)V`에서는 `Object` 타입을 사용한다. 이는 타입 소거에 의한 캐스팅이 아닌 `println(Object x)` 메서드 자체의 파라미터가 `Object`로 선언되어 있기 때문이다.

```java
// PrintStream.println(Object x)
public class PrintStream extends FilterOutputStream
    implements Appendable, Closeable
{
    /* ... */
        /**
     * Prints an Object and then terminate the line.  This method calls
     * at first String.valueOf(x) to get the printed object's string value,
     * then behaves as
     * though it invokes {@link #print(String)} and then
     * {@link #println()}.
     *
     * @param x  The {@code Object} to be printed.
     */
    public void println(Object x) {
        String s = String.valueOf(x);
        if (getClass() == PrintStream.class) {
            // need to apply String.valueOf again since first invocation
            // might return null
            writeln(String.valueOf(s));
        } else {
            synchronized (this) {
                print(s);
                newLine();
            }
        }
    }
    /* ... */

}
```

&nbsp; `print2()` 제너릭 메서드는 `V value`를 `Parent`가 아닌 `Object`로 치환하고 있다. 이는 당연하게도 타입이 한정되어 있는 클래스 수준의 제너릭 `T`와 달리 별도의 메서드 수준 제너릭이기 때문이다. 

## Heap Pollution

&nbsp; 필자는 리액트 프로젝트 등을 진행할 때 자바스크립트를 사용하며 타입이 존재하지 않는 다는 것이 큰 불편함과 차후 문제를 야기할 수 있다는 것을 크게 느낀 경험이 있다. 처음 타입 소거를 들었을 때 "객체 지향에서 타입이 사라진다면 문제가 발생할 수 있지 않나?"라는 생각을 하였다. 

&nbsp; 제너릭이 도입됨으로 인해 컴파일 시점에 타입을 확인할 수 있게 되었지만, 결국 컴파일 후에는 타입이 소거되기 때문에 '컴파일 시점에만 타입이 논리적으로 일치'하면 결국 컴파일은 진행이 된다.

&nbsp; 아래의 예시를 통해서 이러한 요소들이 어떠한 문제로 이어질 수 있는지 알아보자.

```java
public class C <T> {
    private List<T> fruits = new ArrayList<>();
    
    public void addFruit(T fruit) {
        this.fruits.add(fruit);
    }
    
    public List<T> getFruits() {
        return this.fruits;
    }
    
    public static void main(String[] args) {
        C c = new C();
        
        c.addFruit("apple");
        c.addFruit(1L);
        
        System.out.println(c.getFruits());
    }
}
```

&nbsp; 다음 코드는 `T` 제너릭을 사용하는 제너릭 클래스이다. 우선 타입이 존재하지 않는 Raw 타입을 사용한다는 것이 어떠한 문제를 일으킬 수 있는지 확인하기 위하여 main 메서드 내에 Raw 타입의 인스턴스 `c`를 생성하였다.

&nbsp; `c`는 제너릭이 정해지지 않은 인스턴스이다. 즉 컴파일 시점에서 타입의 일치 여부를 확인할 수 있는 방법이 없는 상태(unchecked)이다.


<table style="border: 0.5px solid #d1d1d1; border-radius: 5px;">
    <tr>
        <td style="border-bottom: 0.5px solid #d1d1d1; border-radius: 5px;">
            <img src="/assets/img/docs/etc/type-erasure/heap-pollution-1.png" alt="heap-pollution-1" />
        </td>
        <td style="border-bottom: 0.5px solid #d1d1d1; border-radius: 5px;">
            <img src="/assets/img/docs/etc/type-erasure/heap-pollution-2.png" alt="heap-pollution-2" />
        </td>
    </tr>
    <tr>
        <td style="text-align: center; background-color: rgba(0, 0, 0, 0.02); border-bottom: 0.5px solid #d1d1d1; border-radius: 5px;">
            실행 결과
        </td>
        <td style="text-align: center; background-color: rgba(0, 0, 0, 0.02); border-bottom: 0.5px solid #d1d1d1; border-radius: 5px;">
            fruits 리스트 원소
        </td>
    </tr>
</table>

&nbsp; 위 결과 마치 자바스크립트처럼 `List<T> fruits` 객체가 String(상수)과 Long 타입의 원소를 모두 가지고 있는 현상이 나타난다. 이처럼 JVM의 힙 영역에 있는 어떠한 객체가 불량한 데이터를 들고 있는 상황을 **힙 오염(Heap Pollution)**이라 한다. 이러한 힙 오염은 차후 데이터 참조 시 클래스를 적절히 캐스트하지 못하여 `ClassCastException`으로 이어질 수 있다.

&nbsp; 위 처럼 Raw 타입을 사용할 경우 이러한 힙 오염의 문제가 발생할 수 있다. 이 말은 곧, 제너릭이 있더라도 컴파일 시점을 통과한다면 힙 오염이 발생할 가능성이 존재한다는 것이다.

```java
public class D <T> {
    List<T> fruits = new ArrayList<>();
    
    public List<T> getFruits() {
        return this.fruits;
    }
    
    public void addFruit(T fruit) {
        this.fruits.add(fruit);
    }
    
    public static void main(String[] args) {
        D<String> d = new D<>();
        
        Object objList = d.getFruits();
        
        List<Long> longList = (List<Long>) objList;
        longList.add(1L);
        
        d.addFruit("apple");
        
        System.out.println(d.getFruits());
    }
}
```

```
[1, apple]
```

&nbsp; 위 코드는 Raw 타입이 아닌 제너릭을 사용했음에도 결국 타입캐스팅으로 인해 컴파일 시점에서는 문제가 없기 때문에 힙 오염이 발생하였다. 해당 코드는 문제 없이 실행이 되지만 결국 리스트를 순회하거나 원소를 참조할 때 타입 불일치로 인하여 `ClassCastException`으로 이어지게 된다.

```java
for (String fruit : d.getFruits()) {
    System.out.println("fruit: " + fruit);
}
```

<img src="/assets/img/docs/etc/type-erasure/class-cast-exception.png" alt="class-cast-exception" />

### Solution of Heap Pollution

&nbsp; 리스트에서 발생하는 힙 오염 문제는 런타임에서 원소를 조회할 때 예외를 발생시키기 때문에 문제가 된다.

&nbsp; 이에 대한 해결책으로 `Collections.checkedList()` 메서드가 존재한다.

```java
public class D <T> {
    List<T> fruits;
    
    public D(Class<T> type) {
        this.fruits = Collections.checkedList(new ArrayList<T>(), type);
    }

    /* ... */

    public static void main(String[] args) {
        D<String> d = new D<>(String.class);
        
        Object objList = d.getFruits();
        
        List<Long> longList = (List<Long>) objList;
        longList.add(1L);   // ❌ ClassCastException
        
        d.addFruit("apple");
        
        System.out.println(d.getFruits());
        
        for (String fruit : d.getFruits()) {
            System.out.println("fruit: " + fruit);
        }
    }
}
```
&nbsp; `Collections.checkedList()`를 사용하게 된다면 리스트에 다른 타입의 원소가 삽입될 때 `ClassCastException`을 발생시키게 된다. 따라서, 아예 힙이 오염되지 않도록 방지할 수 있다.


## 타입 소거로 인한 메서드 오버로딩 불가 문제 해결 방법

&nbsp; 결국 타입 소거로 인한 메서드 오버로딩이 불가능한 문제를 완전히 해결할 수는 없다. 

&nbsp; 메서드명이나 인자나 반환값을 달리하여 메서드 오버로딩이 되지 않도록 메서드를 분리하는 방법이나, 아예 제너릭 타입으로 선언하여 메서드 내에서 `instanceof`로 해당 객체의 타입을 구분하여 처리하는 방법을 선택해야 한다.

&nbsp; 그러나, 파라미터의 타입에 따라 메서드의 반환값도 다를 경우에는 당연히 두 메서드가 오버로딩된 메서드가 아닌 별도의 메서드로 인식하기 때문에 해당 경우에는 굳이 제너릭을 사용할 필요는 없다고 생각한다. 

# 결론

&nbsp; 자바를 사용하면서 컴파일 과정에 대해 단순히 문법과 타입에 맞게 작성된 코드를 바이트 코드로 바꾼다는 것 정도만 생각했었고 특정한 경우에 어떻게 컴파일이 되는지에 대해서 생각해본 적은 잘 없었던 것 같다. 제너릭도 그 의미를 이해하고 사용하기도 하였지만 정작 이 제너릭이 어떻게 동작하는지에 대해서는 깊게 공부해보았던 적도 없었던 것 같다.

&nbsp; 이번에 List를 인자로 사용하는 메서드의 오버로딩 과정에서 우연히 해당 문제를 발견하게 되었고, 제너릭이 컴파일 되는 과정과 결과로 생성되는 코드에 대해 알아보고 이로 인해 발생하는 문제까지 알 수 있었다.

&nbsp; 리액트로 프론트엔드 코드를 작성하는 등 자바스크립트를 사용할 때, 자바는 객체 지향 언어로 타입이 엄격히 정해져있고 이를 통해 코드 작성 시 많은 편리함과 이점이 존재한다고 느꼈었다. Raw 타입으로 치환되는 제너릭에 대해 서로 다른 타입의 값이 삽입되는 것을 보며 객체 지향에서도 이러한 현상이 발생할 수 있다는 것을 알게되었다. 이는 당연히 ClassCastException으로 이어지지만 이러한 현상이 생길 수 있다는 것이 제너릭을 사용할 때 힙 오염을 경계해야하는 이유인 것 같다. 


# \# Reference
- [Oracle Java - Type Erasure](https://docs.oracle.com/javase/tutorial/java/generics/erasure.html)
- [Java Heap 오염이란?](https://inpa.tistory.com/entry/JAVA-%E2%98%95-%EC%A0%9C%EB%84%A4%EB%A6%AD-%ED%9E%99-%EC%98%A4%EC%97%BC-Heap-Pollution-%EC%9D%B4%EB%9E%80)
- [Generic의 발전과 소거](https://mangkyu.tistory.com/403)