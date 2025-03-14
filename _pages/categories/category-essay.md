---
title: "Essay"
layout: archive
permalink: /essay
author_profile: true
types: posts
sidebar:
    nav: "categories"
description: "개인적인 경험과 그에 대한 기록"
---

{% assign posts = site.categories['essay']%}
{% for post in posts %}
  {% include archive-single.html type=page.entries_layout %}
{% endfor %}