PACKAGE=pidgin-persistent-notification@ikkoku.de.zip

all: $(PACKAGE)

clean:
	-rm $(PACKAGE)

$(PACKAGE): metadata.json extension.js stylesheet.css
	zip $(PACKAGE) $+
