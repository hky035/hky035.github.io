---
title: "Essay"
layout: archive
permalink: /essay
author_profile: true
types: posts
sidebar:
    nav: "categories"
---

{% assign posts = site.categories['essay']%}
{% for post in posts %}
  {% include archive-single.html type=page.entries_layout %}
{% endfor %}