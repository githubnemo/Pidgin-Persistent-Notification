const Main = imports.ui.main;
const Lang = imports.lang;
const DBus = imports.dbus;
const Shell = imports.gi.Shell;

let UserMenuButton = Main.panel.statusArea.userMenu;

const PurpleIface = {
    name: 'im.pidgin.purple.PurpleInterface',
    properties: [],
    methods: [],
    signals: [
        {name: 'DisplayedImMsg', inSignature: 'issii'},
        {name: 'ConversationUpdated', inSignature: 'iu'}
    ]
};

let Purple = DBus.makeProxyClass(PurpleIface);

function PurpleClient() {
    this._init();
}

const PURPLE_CONV_UPDATE_UNSEEN = 4;
const PURPLE_MESSAGE_SYSTEM = 0x4;

PurpleClient.prototype = {

    _init: function() {
		// Nothing to initialize, everything is initialized in enable()
    },

    _onPurpleAppeared: function(owner) {
        this._proxy = new Purple(DBus.session,
			'im.pidgin.purple.PurpleService', '/im/pidgin/purple/PurpleObject');

        this._displayedImMessageId = this._proxy.connect('DisplayedImMsg',
			Lang.bind(this, this._onDisplayedImMsg));

        this._conversationUpdated = this._proxy.connect('ConversationUpdated',
			Lang.bind(this, this._onConversationUpdated));
    },

    _onDisplayedImMsg: function(emitter, _account, _who, _message, _conv, flags) {
		if(flags & PURPLE_MESSAGE_SYSTEM) {
			return;
		}

        let focusApp = Shell.WindowTracker.get_default().focus_app;

        if(focusApp == null || focusApp.get_id() != 'pidgin.desktop') {
			this._addPersistentNotification();
        }
    },

    _onConversationUpdated: function(emitter, _conv, flags) {
        if(flags & PURPLE_CONV_UPDATE_UNSEEN) {
			this._removePersistentNotification();
        }
    },

	_addPersistentNotification: function() {
		UserMenuButton._iconBox.add_style_class_name('pidgin-notification');
	},

	_removePersistentNotification: function() {
		UserMenuButton._iconBox.remove_style_class_name('pidgin-notification');
	},

	enable: function() {
        DBus.session.watch_name('im.pidgin.purple.PurpleService', false,
			Lang.bind(this, this._onPurpleAppeared), null);
	},

	disable: function() {
		this._proxy.disconnect(this._displayedImMessageId);
		this._proxy.disconnect(this._conversationUpdated);

		this._removePersistentNotification();
	}
}

function init() {
	return new PurpleClient();
}


