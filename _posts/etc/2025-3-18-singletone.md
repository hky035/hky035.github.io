---
layout: posts
title:  "Singleton"
author_profile: true
sidbar:
  nav: "main"
category: "etc"
description: "Effective Java를 읽던 중 Singleton 디자인 패턴에 관한 내용을 읽었다. Spring을 사용하다보면 \"Bean은 싱글톤으로 관리된다\"는 이야기를 자주 들을 수 있다. 또한, Spring을 사용해서 프로젝트를 진행할 때 마다 싱글톤이란 개념을 알고는 있었지만 이에 대해 깊게 생각해본 적은 없었던 것 같다. 기본적인 싱글톤 패턴의 개념부터 멀티 쓰레드 환경에서 주의사항에 대해 알아보고자 한다."
published: true
show_date: true
---

# 서론 

&nbsp; 필자는 Spring을 사용하여 싱글톤(Singleton)이란 개념을 처음 알게 되었다. 이후, 스프링을 사용하며 Bean들이 싱글톤으로 관리된다는 것은 알고 있었지만 단순히 개념만 이해를 하고 깊게 생각해보았던 적은 없는 것 같았다. 최근 Effective Java를 읽으면서 싱글톤에 관한 내용을 다시 접할 수 있었다. 해당 절을 읽으면서 스프링에서의 싱글톤이 아닌, 싱글톤 자체에 관한 기본 개념부터 추가적인 고려 사항까지 다양한 방면으로 생각해볼 수 있던 기회를 얻게되었다. 해당 포스팅에서는 이에 관한 내용을 정리하고자 한다.

# Singleton

&nbsp; 싱글톤(Singleton)이란 인스턴스를 단 하나만 생성 가능하도록 하는 디자인 패턴을 의미한다. 객체의 유일성을 보장하여야할 때 사용한다.

&nbsp; 싱글톤은 코드로 확인하는 것이 이해에 더 큰 도움이 된다고 생각한다. [싱글톤의 구현 방식](https://haon.blog/java/singleton/)에는 6가지 방법이 존재한다. 해당 포스팅에서는 생성 방법을 학습하는 것은 아니기에 해당 부분은 생략한다. 이번 포스팅에서는 **Lazy Initialization** 방식으로 싱글톤 클래스를 구현한다.

```java
public class Singleton {
    private static Singleton instance;

    private Singleton() { } // 외부에서 생성자 호출을 제한

    public Singleton getInstance() {
        if(Objects.isNull(instance)) 
            instance = new Singleton();
        return instance;
    }
}    
```

```java
Singleton singleton1 = Singleton.getInstance();
Singleton singleton2 = Singleton.getInstance();

System.out.println(singleton1);
System.out.println(singleton2);
```

<img src="/assets/img/docs/etc/singleton/singleton.png" href="singleton">

&nbsp; 출력 결과에서 알 수 있듯이 두 객체의 해시코드(16진수 형태)가 동일하다는 것을 알 수 있다.

&nbsp; 싱글톤은 <u>하나의 객체만 생성하기 때문에 메모리 자원 낭비를 막을 수가 있다</u>. 싱글톤 패턴이 아니라면 매번 특정 클래스를 사용할 때마다 `new` 키워드를 통해 새로운 객체를 생성하게 될 것이다. 상황에 따라 다르겠지만 굳이 새로운 객체를 생성할 필요가 없는 상황이라면 불필요한 객체의 생성을 막아 메모리 낭비를 줄이고자 하는 것이 싱글톤 패턴의 목적이자 개념이다.

&nbsp; 그러나, 프로그램 내에서 하나의 객체만 공유해서 사용하기 때문에 단점도 존재한다. 바로, 클래스는 <u>상태를 가지면 안 된다(Stateless)는 것</u>이다. 상태라는 것은 클래스 내 멤버 변수이다. 멀티 쓰레드 환경에서 비동기적으로 싱글톤 클래스에 접근해서 특정 상태(멤버)를 조작하게 된다면 상태에 대한 무결성이 위배될 수도 있다. 여러 쓰레드에서 상태를 가진 싱글톤 클래스에 접근하는 상황을 코드를 통해서 확인해보자.

```java
public class Singleton {
    private static Singleton instance;
    private int num = 0; // 싱글톤 클래스 내 상태를 가짐

    private Singleton() { }

    public Singleton getInstance() {
        if(Objects.isNull(instance)) 
            instance = new Singleton();
        return instance;
    }

    // 상태를 조작하는 메서드
    public void add() { 
        num++;
    }

    public int getNum() {
        return this.num;
    }
}
```

```java
Singleton singleton1 = Singleton.getInstance();
Singleton singleton2 = Singleton.getInstance();

for (int i = 0; i < 10000; i++) {
    new Thread(new Runnable() {
        public void run() {
            singleton1.add();
        }
    }).start();
}

for (int i = 0; i < 10000; i++) {
    new Thread(new Runnable() {
        public void run() {
            singleton2.add();
        }
    }).start();
}

System.out.println("singleton1: " + singleton1.getNum());
System.out.println("singleton2: " + singleton2.getNum());
```

&nbsp; 단순히 생각한다면 싱글톤 클래스에 총 20,000번 덧셈을 실시하였으니 20000이 출력되어야 한다고 생각할 수 있다.

<img src="/assets/img/docs/etc/singleton/singleton-1.png" href="singleton-1">

&nbsp; 그러나, 결과로는 19996이 출력되었다. 이는 여러 쓰레드에서 동일한 멤버 `num`에 접근하면서 생기는 동시성 문제이다. 이것이 싱글톤이 상태를 가지면 안 되는 이유이다.

## 멀티쓰레드 환경에서 동시성 문제 해결

&nbsp; 그렇다면, 멀티 쓰레드 환경에서 동시성 문제는 어떻게 해결할까?

&nbsp; 직접 `synchronized`나 `volatile` 키워드를 사용해 멤버 변수나 메서드에 대해 접근을 직접적으로 제어하는 방법이 있다. 또한, Java에서는 비동기 작업에 대한 동시성 문제 해결을 위하여 `java.util.concurrent` 패키지 내에서 다양한 데이터 타입을 제공한다.

&nbsp; 현재 예제에서는 [AtomicInteger](https://docs.oracle.com/javase/8/docs/api/java/util/concurrent/atomic/AtomicInteger.html)를 통하여 해당 문제를 해결해보고자 한다.

```java
public class Singleton {
    private static Singleton instance;
    private AtomicInteger num = new AtomicInteger(0); // AtomicInteger를 사용한 상태(멤버) 선언

    private Singleton() { }

    public Singleton getInstance() {
        if(Objects.isNull(instance)) 
            instance = new Singleton();
        return instance;
    }

    public void add() { 
        num.incrementAndGet();
    }

    public int getNum() {
        return this.num.get();
    }
}
```

<img src="/assets/img/docs/etc/singleton/singleton-2.png" href="singleton-2">

&nbsp; 멤버 변수 num을 `AtomicInteger` 타입으로 바꾸고 난 뒤에는 몇 번의 테스트를 시행하여도 똑같이 20000이라는 결과를 얻을 수 있다. 멀티쓰레드 환경에서도 동시성을 보장할 수 있게 된 것이다. 그러나 동시성을 보장하기 위해서는 Lock 등의 방법을 사용하기 때문에 그만큼의 오버헤드가 소요된다. 따라서, 싱글톤을 사용하였을 때 최선의 방법은 무상태(stateless)로 구성하는 것이다.

# Singleton 패턴에 대한 추가적인 문제

&nbsp; 앞선 절에서는 멀티 쓰레드 환경에서 싱글톤 사용 시 발생할 수 있는 문제에 대해 다루었다. 그러나, Java Reflection과 직렬화/역직렬화 과정 시 발생할 수 있는 추가적인 문제가 있다.

## 1. Java Reflection을 통한 Singleton 패턴 붕괴

&nbsp; Java는 [Reflection](https://www.baeldung.com/java-reflection)이라는 기술을 활용해 런타임에 동적으로 클래스에 접근 가능하다. `Class` 객체를 통하여 특정 클래스에 접근할 수 있으며, 접근 제어자를 무시하고 생성자, 멤버 변수, 메서드 호출이 가능하다.

```java
Singleton singleton1 = Singleton.getInstance();

Constructor<? extneds Singleton> constructor = singlton.getClass().getDeclaredConstructor();
constructor.setAccessible(true); // 생성자 접근을 허용

Singleton singleton2 = constructor.newInstance();

System.out.println(singleton1);
System.out.println(singleton2);
```

<img src="/assets/img/docs/etc/singleton/singleton-3.png" href="singleton-3">

&nbsp; Java Reflection API를 통하여 생성자의 접근 권한을 바꾼 후, 생성자를 통하여 새로운 객체 생성이 가능한 것을 알 수 있다. Java의 Reflection은 런타임 중 동적으로 클래스에 접근 가능하게하는 유연성을 제공하는 기술이지만, 현재 상황에서는 Singleton 패턴을 붕괴해버릴 수도 있다.

## 2. 직렬화/역직렬화 시 새로운 객체 생성

&nbsp; Java에서는 데이터(객체)를 외부로 보내기 위해 직렬화(Serialization)를 사용한다. 또한, 외부에서 온 데이터를 다시 객체로 변환하기 위해 역직렬화(Deserialization)를 사용한다.

```java
// 가독성을 위하여 개별 코드에 try-catch가 아닌 main 메서드 선언부에 throws Exception 추가
Singleton singleton1 = Singleton.getInstance();

String filename = "singleton.txt";

ObjectOutputStream oos = new ObjectOutputStream(new BufferedOutputStream(new FileOutputStream(filename)));
oos.writeObject(singleton1);
oos.close();

ObjectInputStream ois = new ObjectInputStream(new BufferedInputStream(new FileInputStream(filename)));
Singleton singleton2 = (Singleton) ois.readObject();
ois.close();

System.out.println(singleton1);
System.out.println(singleton2);
```

<img src="/assets/img/docs/etc/singleton/singleton-4.png" href="singleton-4">

&nbsp; 역직렬화 후 생성된 객체는 직렬화한 객체와 다른 해시코드를 나타낸다. 즉, 서로 다른 객체이다. 이는 역직렬화 과정에서 새로운 메모리 영역에 객체를 할당하게 되어 서로 다른 객체가 생성되게 되는 것이다.

&nbsp; 이를 해결하기 위해서는 직렬화 대상 객체에 `readResolve()` 메서드를 구현하여야 한다. `readResolve()`는 역직렬화 이후 반환되어야 할 객체를 정의할 수 있다.

&nbsp; 우선, 역직렬화 과정에서 사용되는 메서드인 `readObject()`와 `readResolve()`에 대해 알아볼 필요가 있다.

```java
public class Singleton implements Serializable {
    private static Singleton instance;

    private Singleton() {
        System.out.println("Singleton Constructor");
    }

    public static Singleton getInstance() {
        if (Objects.isNull(instance)) {
            instance = new Singleton();
        }
        return instance;
    }

    // 반드시 private 접근지정자 사용
    private void readObject(ObjectInputStream ois) throws ClassNotFoundException, IOException {
        try {
            ois.defaultReadObject();
            System.out.println("Singleton readObject");
        } catch (Exception e) {
            System.out.println(e.getMessage());
        }
    }
}
```

```java
Singleton singleton1 = Singleton.getInstance();

String filename = "singleton.txt";

ObjectOutputStream oos = new ObjectOutputStream(new BufferedOutputStream(new FileOutputStream(filename)));
oos.writeObject(singleton1);
oos.close();

System.out.println("==========");

ObjectInputStream ois = new ObjectInputStream(new BufferedInputStream(new FileInputStream(filename)));
Singleton singleton2 = (Singleton) ois.readObject();
ois.close();

System.out.println("==========");

System.out.println(singleton1);
System.out.println(singleton2);
```

<img src="/assets/img/docs/etc/singleton/singleton-5.png" href="singleton-5">

&nbsp; 위 결과를 통해 역직렬화 시 `readObject()` 메서드가 실행되는 것을 확인할 수 있다. `readObject()`는 데이터를 역직렬화하여 객체에 바인딩할 때 각 멤버 변수에 값을 할당하는 동작을 수행하는 메서드이다. 단순히 멤버 변수 값을 할당하는 동작만 수행하므로 역직렬화 결과 반환되는 객체는 다른 메모리 영역에 추가로 생성된다.

&nbsp; `readResolve()` 메서드는 역직렬화 후 반환할 객체를 정의하는 메서드이다. 즉, `readObject()`와 `readResolve()`가 동시에 정의되어 있으면 `readResolve()`의 반환 값이 역직렬화의 결과로 반환된다. 따라서, `readResolve()` 메서드를 재정의하여 싱글톤 인스턴스를 반환하도록 설정한다.

```java
public class Singleton implements Serializable {
    private static Singleton instance;

    private Singleton() {
        System.out.println("Singleton Constructor");
    }

    public static Singleton getInstance() {
        if (Objects.isNull(instance)) {
            instance = new Singleton();
        }
        return instance;
    }

    // 반드시 private 접근지정자 사용
    private void readObject(ObjectInputStream ois) throws ClassNotFoundException, IOException {
        try {
            ois.defaultReadObject();
            System.out.println("Singleton readObject");
        } catch (Exception e) {
            System.out.println(e.getMessage());
        }
    }

    // 반드시 private 접근지정자 사용
    private Object readResolve() {
        System.out.println("Singleton readResolve")
        return this.getInstance();
    }
}
```

<img src="/assets/img/docs/etc/singleton/singleton-6.png" href="singleton-6">

&nbsp; `readObject()` 메서드가 실행되었지만, 이후 `readResolve()`가 실행되어 결과적으로 반환되는 객체는 직렬화하였던 객체와 동일한 객체임을 알 수 있다. 즉, `readResolve()` 메서드를 재정의하여 역직렬화 시 싱글톤 객체 불일치 문제를 해결할 수 있다.


# Enum Singleton

&nbsp; 앞서 일반 클래스로 싱글톤 클래스를 구현하였을 때 2가지 문제를 확인하였다.

- Reflection을 통한 private 생성자 호출 가능
- 직렬화 인터페이스 구현 필요 및 직렬화/역직렬화 문제에 따른 추가 메서드 정의 필요

&nbsp; 위 문제를 해결하기 위하여 Enum 클래스를 통하여 Singleton 클래스를 생성한다.

&nbsp; 다른 언어에서는 Enum이 단순히 상수인 것과 달리, Java에서 Enum은 클래스이다. Enum 내에서 상수만 정의가능한 것이 아니라, 변수나 메서드도 정의가능하다. 

&nbsp; Enum은 각 열거형 상수가 고유한 인스턴스를 가지며, 초기에 멤버를 만들 때 단 한 번만 초기화를 하기 때문에 무분별한 객체 생성을 막을 수 있다.

&nbsp; [Java8의 Enum 공식문서](https://docs.oracle.com/javase/specs/jls/se7/html/jls-8.html#jls-8.9)에서는 Enum 타입에 대한 Reflective Instantiation을 금지한다고 명시되어 있다.

> <span style="color: #888888;">"The final clone method in Enum ensures that enum constants can never be cloned, and the special treatment by the serialization mechanism ensures that duplicate instances are never created as a result of deserialization. Reflective instantiation of enum types is prohibited. Together, these four things ensure that no instances of an enum type exist beyond those defined by the enum constants."</span>   
>
<span style="color: #888888;">"Enum 클래스의 final clone 메소드는 enum 상수가 복제될 수 없도록 보장합니다. 또한, 직렬화 메커니즘의 특별한 처리는 역직렬화로 인해 중복 인스턴스가 생성되지 않도록 합니다. enum 타입의 리플렉티브 인스턴스화는 금지되어 있습니다. 이 네 가지 요소가 함께 작용하여 enum 타입의 인스턴스가 enum 상수로 정의된 것 외에는 존재하지 않도록 보장합니다."</span>   
>
<span style="font-weight: bold;">- Oracle Java8 Documentation - 8.9 Enums</span> 

&nbsp; 즉, **(1) Enum 클래스에 대해서는 Reflection을 통한 인스턴스 생성이 불가능**하다.

```java
public enum EnumSingleton {
    INSTANCE;

    private int value = 0;

    public int getValue() {
        return value;
    }

    public void add() {
        this.value++;
    }
}
```

```java
Class<? extends EnumSingleton> enumSingleton = EnumSingleton.class;
Constructor constructor = enumSingleton.getDeclaredConstructor();
constructor.setAccessible(true);
```

<img src="/assets/img/docs/etc/singleton/singleton-7.png" href="singleton-7">

&nbsp; Enum 클래스에 대해서 `getDeclaredConstructor()` 호출 시 `NoSuchMethodException`이 발생하는 것을 알 수 있다.

&nbsp; 또한, **(2) Enum 클래스는 기본적으로 직렬화가 가능**하여 Serializable 인터페이스를 따로 구현할 필요도 없다.

# Summary
<ul style="font-family: 'Noto Sans KR'; padding-inline-start: 20px;">
    <li>Singleton 패턴은 객체 생성 횟수를 단 한 번으로 제한한다.</li>
    <li>Singleton 객체는 멀티쓰레드 환경에서 동시성 문제를 해결하기 위해 무상태(stateless)로 설계되어야 하거나 데이터 무결성을 보장하는 멤버를 사용하여야 한다.</li>
    <li>Java Reflection을 사용하면 Singleton 패턴으로 구성된 클래스여도 별개의 인스턴스 생성이 가능하다.</li>
    <li>역직렬화 시 직렬화한 싱글톤 객체와 다른 객체가 생성된다. 이를 막기 위해서는 클래스 내에 <span style="font-family: 'Fira Code'">readResolve()</span> 메서드를 정의하여야 한다.</li>
    <li>위와 같은 문제를 해결하기 위해서는 Enum Singleton을 사용하여야 한다.</li>
</ul>

<br/>
&nbsp; Spring을 사용한다면 누구나 들어보았을 개념인 Singleton(싱글톤)에 대해 알아보았다. 단순히 하나의 객체만 생성하는 줄 알았던 개념에 대해 더욱 깊고 자세하게 알아보면서 여러가지 상황에서 발생할 수 있는 문제와 이를 고려한 설계 방안에 대해 알 수 있었다. 그러나 여전히 싱글톤 패턴에도 한계점은 존재한다. 

&nbsp; 현재 싱글톤 패턴에는 생성자의 접근제어자를 private로 선언하기 때문에 상속이 불가능하다는 점과 Reflection, 역직렬화 관련 문제를 해결하기 위해 많은 설정이 필요하다는 점 등 사용에 있어 불편함이 존재한다. 또한, 전역 인스턴스를 가지게 되어 객체지향 의도와는 거리감이 있다.

&nbsp; 대규모 트래픽을 감당해야하는 Spring은 Bean들을 싱글톤으로 생성하여 자원을 효율적으로 관리한다. 따라서, 위와 같은 고려 사항들을 해결하기 위하여 **Singleton Registry**를 두어 싱글톤 객체(Bean)들을 관리한다. 차후 스프링의 Bean과 싱글톤에 대해 더 자세하게 공부하여 포스팅을 작성하고자 한다.

# \# Reference
- [자바 직렬화: readResolve와 writeReplace](https://madplay.github.io/post/what-is-readresolve-method-and-writereplace-method)
- [싱글톤(Singleton) 패턴 - 꼼꼼하게 알아보자](https://inpa.tistory.com/entry/GOF-%F0%9F%92%A0-%EC%8B%B1%EA%B8%80%ED%86%A4Singleton-%ED%8C%A8%ED%84%B4-%EA%BC%BC%EA%BC%BC%ED%95%98%EA%B2%8C-%EC%95%8C%EC%95%84%EB%B3%B4%EC%9E%90#bill_pugh_solution_lazyholder_%E2%9C%A8)
- [싱글톤(SingleTon) 패턴 구현방법 6가지, Bill Pugh Solution](https://haon.blog/java/singleton/)
- [[Java] Enum과 싱글톤(Singleton)](https://scshim.tistory.com/361)
- [Java8 - Enums](https://docs.oracle.com/javase/specs/jls/se7/html/jls-8.html#jls-8.9)