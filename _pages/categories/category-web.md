---
title: "Web"
layout: archive
permalink: /web
author_profile: true
types: posts
sidebar:
    nav: "categories"
description: "프론트-백엔드 관련 전반적인 웹 개발 지식 <br>_Spring, React"
---
{% assign posts = site.categories['web']%}
{% for post in posts %}
  {% include archive-single.html type=page.entries_layout %}
{% endfor %}