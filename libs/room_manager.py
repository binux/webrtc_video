#!/usr/bin/env python
# -*- encoding: utf-8 -*-
# vim: set et sw=4 ts=4 sts=4 ff=unix fenc=utf8:
# Author: Binux<i@binux.me>
#         http://binux.me
# Created on 2013-04-22 16:15:32

class RoomManager(object):
    def __init__(self):
        self.rooms = {}

    def new(self, meta):
        if meta['hash'] in self.rooms:
            if self.rooms[meta['hash']].sha1_array == meta['sha1_array']:
                return self.rooms[meta['hash']]
            else:
                return None
        else:
            self.rooms[meta['hash']] = Room(meta['hash'], meta)
            return self.rooms[meta['hash']]

    def delete(self, roomid):
        if roomid in self.rooms:
            del self.rooms[roomid]

    def get(self, roomid):
        return self.rooms.get(roomid)

    def keys(self):
        return self.rooms.keys()

class Room(object):
    def __init__(self, id, meta):
        for each in ('hash', 'sha1_array', 'filename', 'piece_size', 'block_size', 'size', 'type'):
            setattr(self, each, meta[each])

        self.id = id
        self.meta = meta
        self.title = self.filename
        self.peers = {}

    def join(self, peerid, ws):
        self.peers[peerid] = Peer(peerid, ws)
        return self.peers[peerid]

    def leave(self, peerid):
        if peerid in self.peers:
            del self.peers[peerid]

    def get(self, peerid):
        return self.peers.get(peerid)

    def peer_list(self):
        result = {}
        for each in self.peers.itervalues():
            result[each.peerid] = {
                    'bitmap': each.bitmap,
                    }
        return result

class Peer(object):
    def __init__(self, peerid, ws):
        self.ws = ws
        self.peerid = peerid
        self.bitmap = ''
