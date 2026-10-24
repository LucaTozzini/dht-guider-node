# Guider Nodes: Keyword Search for the BitTorrent DHT

CSC 466 (Overlay and Peer-to-Peer Networking) course project, University of Victoria.
Luca Tozzini, solo project.

## What this is

BitTorrent's Mainline DHT answers exactly one question: given an info hash, which peers have it. It cannot be searched. If you do not already know the hash, you need a website to tell you one, and those websites are centralized points of failure.

A guider node (GN) is a DHT participant that also crawls. It harvests info hashes from DHT traffic, fetches torrent metadata from peers with BEP 9, and builds a local catalogue that maps file names and metadata to info hashes. Other nodes can then ask a guider for a keyword and get matching hashes back, then download as usual through the normal DHT.

Guiders are discovered in-protocol: each one registers under a fixed, well-known DHT key, found with an ordinary get_peers lookup. No central index, no separate directory.

Project website (logbook, updates, results): https://lucatozzini.github.io/dht-guider-node/

## Milestones

| Dates                | Milestone                                                                                      | Status      |
| -------------------- | ---------------------------------------------------------------------------------------------- | ----------- |
| Oct 10-23, 2026      | Crawler: join the Mainline DHT, harvest info hashes, fetch metadata (BEP 9), start the logbook | In progress |
| Oct 24 - Nov 6, 2026 | Local index and keyword search, guider discovery, midterm progress demo                        | Upcoming    |
| Nov 7-20, 2026       | Simulation under churn: catalogue coverage, query latency, one vs. several guiders             | Upcoming    |
| Nov 21 - Dec 4, 2026 | Freshness rechecks, cross-checking between guiders, final integration, report and demo         | Upcoming    |

## Evaluation

Two cross-checked methods:

- Live measurement on the Mainline DHT: hash discovery rate, metadata fetch success rate, catalogue growth, stale-entry rate.
- Simulation under churn: catalogue coverage, query latency, and whether asking several guiders improves results over asking one.

## Logbook

Progress and measurement notes are kept in the logbook and posted to the project website as the work goes.

## References

- Maymounkov and Mazieres, Kademlia: A Peer-to-Peer Information System Based on the XOR Metric (2002).
- BEP 5 (DHT Protocol) and BEP 9 (Extension for Peers to Send Metadata Files).
- Falkner et al., An Analysis of BitTorrent's Two Kademlia-Based DHTs (2007).
