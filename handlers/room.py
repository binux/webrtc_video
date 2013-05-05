#!/usr/bin/env python
# -*- encoding: utf-8 -*-
# vim: set et sw=4 ts=4 sts=4 ff=unix fenc=utf8:
# Author: Binux<i@binux.me>
#         http://binux.me
# Created on 2013-04-20 20:03:41

import uuid
import json
from base import *

class NewHandler(BaseHandler):
    def get(self):
        self.render('room/new.html')

class ListRoomHandler(BaseHandler):
    def get(self):
        rooms = self.room_manager.rooms
        self.render('room/list.html', rooms = rooms)

class RoomHandler(BaseHandler):
    def get(self, roomid):
        room = self.room_manager.get(roomid)
        if not room:
            raise HTTPError(404)
        self.render('room/index.html', room = room)

class RoomWebSocket(BaseWebSocket):
    def open(self):
        logging.debug('new socket')
        self.peerid = str(uuid.uuid4())
        self.peer = None
        self.room = None
        self.write_message({'cmd': 'peerid', 'peerid': self.peerid})

    def on_message(self, message):
        data = json.loads(message)
        logging.debug('ws: %s' % message)

        if data.get('cmd') and callable(getattr(self, 'cmd_'+data.get('cmd', ''), None)):
            getattr(self, 'cmd_'+data.get('cmd', ''))(data)
        elif data.get('type') and data.get('target'):
            if not self.room:
                return
            target = self.room.get(data.get('target'))
            if target:
                target.ws.write_message(message)

    def on_close(self):
        if self.room:
            self.room.leave(self.peerid)
            if len(self.room.peers) == 0:
                self.room_manager.delete(self.room.id)

    def cmd_new_room(self, data):
        self.room = self.room_manager.new(data['file_meta'])
        self.peer = self.room.join(self.peerid, self)
        self.write_message({'cmd': 'file_meta', 'file_meta': self.room.meta})

    def cmd_join_room(self, data):
        self.room = self.room_manager.get(data['roomid'])
        if self.room:
            self.peer = self.room.join(self.peerid, self)
            self.write_message({'cmd': 'file_meta', 'file_meta': self.room.meta})

    def cmd_get_meta(self, data):
        if self.room:
            self.write_message({'cmd': 'file_meta', 'file_meta': self.room.meta})

    def cmd_get_peer_list(self, data):
        if self.room:
            self.write_message({'cmd': 'peer_list', 'peer_list': self.room.peer_list()})

    def cmd_update_bitmap(self, data):
        if self.peer:
            self.peer.bitmap = data['bitmap']

    def cmd_add_http_peer(self, data):
        if self.room:
            peer = self.room.join(data['url'], self)
            peer.bitmap = data['bitmap']

handlers = [
        (r'/room', ListRoomHandler),
        (r'/room/new', NewHandler),
        (r'/room/ws', RoomWebSocket),
        (r'/room/(\w+)', RoomHandler),
        ]
