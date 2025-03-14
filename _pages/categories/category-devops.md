---
title: "DevOps"
layout: archive
permalink: /devops
author_profile: true
types: posts
sidebar:
    nav: "categories"
description: "DevOps 관련 기술 및 지식"
---

{% assign posts = site.categories['devops']%}
{% for post in posts %}
  {% include archive-single.html type=page.entries_layout %}
{% endfor %}