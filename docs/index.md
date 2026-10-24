---
title: Guider Nodes
---

# Guider Nodes: Keyword Search for the BitTorrent DHT

CSC 466 (Overlay and Peer-to-Peer Networking) course project, University of Victoria. Luca Tozzini, solo project.

BitTorrent's Mainline DHT answers exactly one question: given an info hash, which peers have it. It cannot be searched. A **guider node** is a DHT participant that also crawls: it collects info hashes, fetches their metadata from peers with BEP 9, and builds a local catalogue mapping torrent names to info hashes. Other nodes can then ask a guider for a keyword and download the matching torrents through the normal DHT. Guiders are discovered in-protocol, by registering under a well-known DHT key.

- [Logbook](logbook/): progress and measurement notes
- [Source code](https://github.com/LucaTozzini/dht-guider-node)

## Milestones

| Dates                | Milestone                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| Oct 10-23, 2026      | Crawler: join the Mainline DHT, harvest info hashes, fetch metadata (BEP 9), start the logbook |
| Oct 24 - Nov 6, 2026 | Local index and keyword search, guider discovery, midterm progress demo                        |
| Nov 7-20, 2026       | Simulation under churn: catalogue coverage, query latency, one vs. several guiders             |
| Nov 21 - Dec 4, 2026 | Freshness rechecks, cross-checking between guiders, final integration, report and demo         |
