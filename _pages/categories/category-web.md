---
title: "Web"
layout: archive
permalink: /web
author_profile: true
types: posts
sidebar:
    nav: "categories"
---

{% assign posts = site.categories['web']%}
{% for post in posts %}
  {% include archive-single.html type=page.entries_layout %}
{% endfor %}