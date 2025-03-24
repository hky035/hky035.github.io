---
title: "Etc"
layout: archive
permalink: /etc
author_profile: true
types: posts
sidebar:
    nav: "categories"
description: "기타 학습 내용에 대한 정리"
---

{% assign posts = site.categories['etc']%}
{% for post in posts %}
  {% include archive-single.html type=page.entries_layout %}
{% endfor %}