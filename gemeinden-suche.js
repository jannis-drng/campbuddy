(function () {
  var feld = document.getElementById('suchfeld')
  var raum = document.getElementById('suchergebnis')
  var liste = document.getElementById('volleListe')
  if (!feld || !raum) return

  var daten = null
  var laedt = false

  /*
    Zwei Schreibweisen, weil Menschen beide tippen.

    Wer den Umlaut nicht auf der Tastatur hat, schreibt entweder 'zuerich' oder
    'zurich' — und das sind zwei verschiedene Vereinfachungen desselben Namens.
    Wird nur eine gebildet, findet die jeweils andere Eingabe nichts, und die
    Suche wirkt kaputt, obwohl der Ort in der Liste steht. Also beide bilden
    und beide vergleichen.
  */
  function ausgeschrieben(t) {
    return t.toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  }

  function entblaettert(t) {
    return t.toLowerCase()
      .replace(/ß/g, 'ss')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  }

  function zeichne(begriff) {
    if (!begriff) { raum.innerHTML = ''; if (liste) liste.hidden = false; return }
    if (liste) liste.hidden = true
    if (!daten) { raum.textContent = 'Einen Moment …'; return }

    var a = ausgeschrieben(begriff)
    var e = entblaettert(begriff)

    /*
      Rangfolge, sonst steht das Falsche oben.

      Reines Enthalten reicht nicht: 'sion' kommt in 'La Conversion' und
      'Mission' vor, und alphabetisch sortiert standen die vor Sion selbst.
      Wer einen Ortsnamen eintippt, meint fast immer genau diesen Ort.

      0 = genau dieser Name, 1 = beginnt damit, 2 = enthält es irgendwo.
      Innerhalb desselben Rangs zählt die Länge: der kürzere Name enthält den
      Suchbegriff zu einem grösseren Teil und ist damit näher dran. Und eine
      Gemeinde schlägt einen gleichrangigen Ortsteil, weil die Rechtslage an
      ihr hängt.
    */
    function passtAufNamen(g, a2, e2) {
      return g._na.indexOf(a2) !== -1 || g._ne.indexOf(e2) !== -1
    }

    function rang(g) {
      // Gegen die einzelnen Namen geprüft, nicht gegen die zusammengesetzte
      // Zeile: sonst wäre kein Name mehr ein genauer Treffer, sobald ein
      // zweiter danebensteht.
      var genau = false
      var anfang = false
      for (var i = 0; i < g._teile.length; i++) {
        var t = g._teile[i]
        if (t.a === a || t.e === e) genau = true
        if (t.a.indexOf(a) === 0 || t.e.indexOf(e) === 0) anfang = true
      }
      if (genau) return 0
      if (anfang) return 1
      return 2
    }

    /*
      Bei gleichem Rang: Gemeinde, dann Kanton, dann Ortsteil.

      'Bern' ist beides — Gemeinde und Kanton. Wer den Namen allein eintippt,
      meint meist die Stadt; der Kanton steht direkt darunter. Ein Ortsteil
      kommt zuletzt, weil er keine eigene Rechtslage hat.
    */
    function art(g) { return g.g ? 2 : (g.t === 'kanton' ? 1 : 0) }
    var treffer = daten
      .filter(function (g) { return g._a.indexOf(a) !== -1 || g._e.indexOf(e) !== -1 })
      .map(function (g) { return { g: g, r: rang(g) } })
      .sort(function (x, y) {
        if (x.r !== y.r) return x.r - y.r
        if (art(x.g) !== art(y.g)) return art(x.g) - art(y.g)
        if (x.g.n.length !== y.g.n.length) return x.g.n.length - y.g.n.length
        return x.g.n.localeCompare(y.g.n, 'de')
      })
      .map(function (t) { return t.g })
    if (treffer.length === 0) {
      raum.textContent = 'Keine Gemeinde dieses Namens. Vielleicht ein Ortsteil? '
        + 'Auf der Karte findest du die zuständige Gemeinde über den Ort selbst.'
      return
    }

    var ul = document.createElement('ul')
    treffer.slice(0, 40).forEach(function (g) {
      var li = document.createElement('li')
      var links = document.createElement('span')
      if (g.p) {
        var ziel = document.createElement('a')
        ziel.href = g.p
        ziel.textContent = g.n
        links.appendChild(ziel)
      } else {
        links.textContent = g.n
      }

      /*
        Kam der Treffer ueber den Zweitnamen, steht er in Klammern dahinter.

        Wer 'Sitten' eintippt und 'Sion' zurueckbekommt, saehe sonst einen
        fremden Namen und wuesste nicht, ob das seine Gemeinde ist. Er steht
        am Namen und nicht in der Spalte rechts, weil er zum Namen gehoert —
        rechts stuende bei Genève sonst 'auch Genf · Genf'.

        Nur die Teile, die nicht ohnehin dastehen: OSM schreibt
        'Valais/Wallis', und '(Valais/Wallis)' hinter 'Wallis' waere zur
        Haelfte Wiederholung.
      */
      if (g.a && !passtAufNamen(g, a, e)) {
        var andere = g.a.split('/')
          .map(function (t) { return t.trim() })
          .filter(function (t) { return t && t !== g.n })
        if (andere.length > 0) {
          var zusatz = document.createElement('span')
          zusatz.className = 'auch'
          zusatz.textContent = ' (' + andere.join(', ') + ')'
          links.appendChild(zusatz)
        }
      }
      var rechts = document.createElement('span')
      rechts.className = 'wo'
      var wo
      if (g.t === 'kanton') {
        wo = 'Kanton'
      } else {
        wo = g.g ? 'Ortsteil von ' + g.g : g.k
        if (g.g && g.k) wo += ' · ' + g.k
        if (!g.p) wo += ' · noch nicht nachgeschlagen'
      }
      rechts.textContent = wo
      li.appendChild(links)
      li.appendChild(rechts)
      ul.appendChild(li)
    })
    raum.innerHTML = ''
    if (treffer.length > 40) {
      var mehr = document.createElement('p')
      mehr.className = 'leise'
      mehr.textContent = treffer.length + ' Treffer, die ersten 40 stehen hier.'
      raum.appendChild(mehr)
    }
    raum.appendChild(ul)
  }

  function hole() {
    if (daten || laedt) return Promise.resolve()
    laedt = true
    return fetch('/campbuddy/gemeinden-suche.json')
      .then(function (r) { return r.json() })
      .then(function (j) {
        daten = j.map(function (g) {
          /*
            Der Zweitname wird an den Suchtext angehängt, nicht getrennt
            geführt: gesucht wird auf einer Zeichenkette, und 'Wallis Valais'
            enthält beides. Angezeigt wird weiterhin nur g.n.
          */
          var voll = g.a ? g.n + ' ' + g.a.replace(/\//g, ' ') : g.n
          g._a = ausgeschrieben(voll)
          g._e = entblaettert(voll)
          /*
            Jeder Name einzeln, zusaetzlich zur gemeinsamen Zeile.

            OSM schreibt mehrsprachige Namen als Liste mit Schraegstrich:
            'Valais/Wallis', 'Graubuenden/Grischun/Grigioni'. Als ein Stueck
            verglichen ist 'valais' darin nur enthalten, nicht gleich — und
            landete damit hinter 'Port-Valais'. Aufgeteilt ist es ein genauer
            Treffer, und der Kanton steht oben.
          */
          g._teile = (g.a ? g.n + '/' + g.a : g.n).split('/').map(function (t) {
            return { a: ausgeschrieben(t.trim()), e: entblaettert(t.trim()) }
          })
          g._na = ausgeschrieben(g.n)
          g._ne = entblaettert(g.n)
          return g
        })
      })
      .catch(function () {
        raum.textContent = 'Die Suche lässt sich gerade nicht laden. Die Liste darunter steht weiterhin.'
        if (liste) liste.hidden = false
      })
      .then(function () { laedt = false })
  }

  feld.addEventListener('input', function () {
    var begriff = feld.value.trim()
    if (!begriff) { zeichne(''); return }
    hole().then(function () { zeichne(feld.value.trim()) })
  })
})()
