---
title: Logbook
---

# Logbook

Progress and measurement notes, newest first.

{% assign entries = site.pages | where_exp: "p", "p.path contains 'logbook/2'" | sort: "path" | reverse %}

<ul>
{% for entry in entries %}<li><a href="{{ entry.url | relative_url }}">{{ entry.date | date: "%Y-%m-%d" }}: {{ entry.title }}</a></li>
{% endfor %}</ul>

[← Home]({{ "/" | relative_url }})
