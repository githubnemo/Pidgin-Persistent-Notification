const Main = imports.ui.main;
const Lang = imports.lang;
const DBus = imports.dbus;
const Shell = imports.gi.Shell;

let UserMenuButton = Main.panel._statusArea.userMenu;

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

PurpleClient.prototype = {
    _init: function() {
        this._iconBoxOriginalStyle = '';

        DBus.session.watch_name('im.pidgin.purple.PurpleService', false,
			Lang.bind(this, this._onPurpleAppeared), null);
    },

    _onPurpleAppeared: function(owner) {
        this._proxy = new Purple(DBus.session,
			'im.pidgin.purple.PurpleService', '/im/pidgin/purple/PurpleObject');

        this._displayedImMessageId = this._proxy.connect('DisplayedImMsg',
			Lang.bind(this, this._onDisplayedImMsg));

        this._conversationUpdated = this._proxy.connect('ConversationUpdated',
			Lang.bind(this, this._onConversationUpdated));
    },

    _onDisplayedImMsg: function(emitter, _account, _who, _message, _conv, _flags) {
        let focusApp = Shell.WindowTracker.get_default().focus_app;

        if(focusApp == null || focusApp.get_id() != 'pidgin.desktop') {
            let orgStyle = UserMenuButton._iconBox.get_style();
            this._iconBoxOriginalStyle = (orgStyle === null) ? '' : orgStyle;

            UserMenuButton._iconBox.set_style("color: red;");
        }
    },

    _onConversationUpdated: function(emitter, _conv, flags) {
        const PURPLE_CONV_UPDATE_UNSEEN = 4;

        if(flags & PURPLE_CONV_UPDATE_UNSEEN) {
            UserMenuButton._iconBox.set_style(this._iconBoxOriginalStyle);
        }
    },
}

function init() {
}

function enable() {
	let purpleClient = new PurpleClient();
}

function disable() {
}
