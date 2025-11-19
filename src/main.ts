// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css"; // supporting style for Leaflet
import "./style.css"; // student-controlled page style

// Fix missing marker images
import "./_leafletWorkaround.ts"; // fixes for missing Leaflet images

// Import our luck function
import luck from "./_luck.ts";

interface Cell {
  value: number;
  i: number;
  j: number;
  originalvalue: number;
  rect: leaflet.Rectangle;
}

interface CellMemento {
  i: number;
  j: number;
  value: number;
  originalvalue: number;
}

interface playerInfo {
  numberHeld: number;
  marker: leaflet.Marker;
}

interface SavedGame {
  modifiedEntries: Array<[string, CellMemento]>;
  playerHeld: number;
  playerLat: number;
  playerLng: number;
}

const activeCells: Map<string, Cell> = new Map();

const modifiedCells: Map<string, CellMemento> = new Map();

let isGeolocation = false;

// Create basic UI elements
const controlPanelDiv = document.createElement("div");
controlPanelDiv.id = "controlPanel";
document.body.append(controlPanelDiv);

const mapDiv = document.createElement("div");
mapDiv.id = "map";
document.body.append(mapDiv);

const statusPanelDiv = document.createElement("div");
statusPanelDiv.id = "statusPanel";
document.body.append(statusPanelDiv);

// Our classroom location
const CLASSROOM_LATLNG = leaflet.latLng(
  36.997936938057016,
  -122.05703507501151,
);

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19.2;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 19;
const PLAYER_RANGE = 5;
//const CACHE_SPAWN_PROBABILITY = 1;

// Create the map (element with id "map" is defined in index.html)
const map = leaflet.map(mapDiv, {
  center: CLASSROOM_LATLNG,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
  dragging: false,
});

// Populate the map with a background tile layer
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: GAMEPLAY_ZOOM_LEVEL,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

// Add a marker to represent the player
const playerMarker = leaflet.marker(CLASSROOM_LATLNG);
playerMarker.bindTooltip("You!");
playerMarker.addTo(map);

const player: playerInfo = {
  numberHeld: 0,
  marker: playerMarker,
};

// Display the player's points
statusPanelDiv.innerHTML = "You are not holding anything";

// Movement Buttons
const movementButtonsDiv = document.createElement("div");
document.body.append(movementButtonsDiv);

const northButton = document.createElement("button");
northButton.innerHTML = "North";
movementButtonsDiv.appendChild(northButton);
northButton.addEventListener("click", () => {
  MovePlayer(
    player.marker.getLatLng().lat + TILE_DEGREES,
    player.marker.getLatLng().lng,
  );
});

const eastButton = document.createElement("button");
eastButton.innerHTML = "East";
movementButtonsDiv.appendChild(eastButton);
eastButton.addEventListener("click", () => {
  MovePlayer(
    player.marker.getLatLng().lat,
    player.marker.getLatLng().lng + TILE_DEGREES,
  );
});

const southButton = document.createElement("button");
southButton.innerHTML = "South";
movementButtonsDiv.appendChild(southButton);
southButton.addEventListener("click", () => {
  MovePlayer(
    player.marker.getLatLng().lat - TILE_DEGREES,
    player.marker.getLatLng().lng,
  );
});

const westButton = document.createElement("button");
westButton.innerHTML = "West";
movementButtonsDiv.appendChild(westButton);
westButton.addEventListener("click", () => {
  MovePlayer(
    player.marker.getLatLng().lat,
    player.marker.getLatLng().lng - TILE_DEGREES,
  );
});

const locationToggleDiv = document.createElement("div");
document.body.append(locationToggleDiv);

const locationToggle = document.createElement("button");
locationToggle.innerHTML = "Enable Geolocation";
locationToggleDiv.appendChild(locationToggle);
locationToggle.addEventListener("click", () => {
  if (movementButtonsDiv.hidden) {
    movementButtonsDiv.hidden = false;
    locationToggle.innerHTML = "Enable Geolocation";
    isGeolocation = false;
  } else {
    movementButtonsDiv.hidden = true;
    isGeolocation = true;
    setInterval(geolocationLoop, 50);
    locationToggle.innerHTML = "Enable Button Movement";
  }
});

const saveLoadDiv = document.createElement("div");
document.body.append(saveLoadDiv);

const saveButton = document.createElement("button");
saveButton.innerHTML = "Save";
saveLoadDiv.appendChild(saveButton);
saveButton.addEventListener("click", () => {
  for (const [key, cell] of activeCells) {
    if (cell.value !== cell.originalvalue) {
      modifiedCells.set(key, makeMementoFromCell(cell));
    } else {
      modifiedCells.delete(key);
    }
  }

  const saved: SavedGame = {
    modifiedEntries: Array.from(modifiedCells.entries()),
    playerHeld: player.numberHeld,
    playerLat: player.marker.getLatLng().lat,
    playerLng: player.marker.getLatLng().lng,
  };

  localStorage.setItem("savedGame", JSON.stringify(saved));
  alert("game saved");
});

const loadButton = document.createElement("button");
loadButton.innerHTML = "Load";
saveLoadDiv.appendChild(loadButton);
loadButton.addEventListener("click", () => {
  const raw = localStorage.getItem("savedGame");
  if (!raw) {
    alert("No save data found.");
    return;
  }

  try {
    const parsed: SavedGame = JSON.parse(raw);
    modifiedCells.clear();
    for (const [k, m] of parsed.modifiedEntries ?? []) {
      modifiedCells.set(k, m);
    }
    for (const [_key, cell] of activeCells) {
      if (cell.rect) {
        if (typeof cell.rect.remove === "function") {
          cell.rect.remove();
        } else {
          map.removeLayer(cell.rect);
        }
      }
    }
    activeCells.clear();

    player.numberHeld = parsed.playerHeld ?? 0;
    updateInventory();

    const lat = parsed.playerLat ?? CLASSROOM_LATLNG.lat;
    const lng = parsed.playerLng ?? CLASSROOM_LATLNG.lng;
    player.marker.setLatLng(leaflet.latLng(lat, lng));

    MovePlayer(lat, lng);
  } catch (err) {
    console.error("Failed to load save:", err);
    alert("Failed to load save (parse error).");
  }
});

function geolocationLoop() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((position) => {
      MovePlayer(position.coords.latitude, position.coords.longitude);
    }, () => {
      console.log("errorgetting location");
    }, { enableHighAccuracy: true });
  } else {
    alert("Geolocation is not supported by this browser.");
    return;
  }
}

function updateInventory() {
  if (player.numberHeld >= 64) {
    alert("you won the game");
  }
  if (player.numberHeld != 0) {
    statusPanelDiv.innerHTML =
      `You are holding the number = ${player.numberHeld}`;
  } else {
    statusPanelDiv.innerHTML = "You are not holding anything";
  }
}

//return the number of a cells value based on position
function makeValue(i: number, j: number): number {
  const rng = luck([i, j, "initialValue"].toString());
  if (rng < .7) {
    return 0;
  } else if (rng < .85) {
    return 1;
  } else if (rng < .95) {
    return 2;
  } else {
    return 4;
  }
}

function isInRange(i: number, j: number): boolean {
  const newI = i - latToCellI(player.marker.getLatLng().lat);
  const newJ = j - lngToCellJ(player.marker.getLatLng().lng);
  if (Math.sqrt(newI ** 2 + newJ ** 2) < PLAYER_RANGE) {
    return true;
  }
  return false;
}

function MovePlayer(lat: number, lng: number) {
  player.marker.setLatLng(leaflet.latLng(lat, lng));
  map.setView(player.marker.getLatLng(), GAMEPLAY_ZOOM_LEVEL, {
    animate: false,
  });

  //modify existing cells or remove
  const iStart = latToCellI(player.marker.getLatLng().lat) - NEIGHBORHOOD_SIZE;
  const iEnd = latToCellI(player.marker.getLatLng().lat) + NEIGHBORHOOD_SIZE;
  const jStart = lngToCellJ(player.marker.getLatLng().lng) - NEIGHBORHOOD_SIZE;
  const jEnd = lngToCellJ(player.marker.getLatLng().lng) + NEIGHBORHOOD_SIZE;
  for (let i = iStart; i < iEnd; i++) {
    for (let j = jStart; j < jEnd; j++) {
      const thisCell = activeCells.get(cellKey(i, j));
      if (thisCell === undefined) {
        //has this cell been modified before if it has spawn that one if it hasnt make it again
        const modifiedcell = modifiedCells.get(cellKey(i, j));
        if (modifiedcell !== undefined) {
          spawnCache(i, j, modifiedcell);
        } else {
          spawnCache(i, j);
        }
        continue;
      }
      HandlePopup(thisCell);
      if (!isInRange(i, j)) {
        thisCell.rect.setStyle({ color: "red" });
      } else {
        thisCell.rect.setStyle({ color: "#3388ff" });
      }
    }

    if (isGeolocation) {
      console.log("geolocation");
    }
  }

  //remove old cells
  const keysToRemove: string[] = [];
  for (const [key, value] of activeCells) {
    //parse the string
    const [si, sj] = key.split(",");
    const i = parseInt(si.trim(), 10);
    const j = parseInt(sj.trim(), 10);
    //check if in bounds
    if (!((i >= iStart && i < iEnd) && (j >= jStart && j < jEnd))) {
      //check if it was modified if it wasnt then store it for later
      if (value.value !== value.originalvalue) {
        modifiedCells.set(cellKey(i, j), makeMementoFromCell(value));
      }
      keysToRemove.push(key);
    }
  }

  for (const key of keysToRemove) {
    const cell = activeCells.get(key);
    if (!cell) continue;
    if (typeof cell.rect.remove === "function") {
      cell.rect.remove();
    } else {
      map.removeLayer(cell.rect);
    }
    activeCells.delete(key);
  }
}

function cellKey(i: number, j: number): string {
  return `${i},${j}`;
}

function HandlePopup(currentCell: Cell): HTMLDivElement {
  const popupDiv = document.createElement("div");

  // set popup based on state of player and box
  if (!isInRange(currentCell.i, currentCell.j)) { //----------------------------------------------------------------------------------------player is not in range
    popupDiv.innerHTML = `
                <div>You are not in range!</div>`;
  } else if (currentCell.value == 0 && player.numberHeld != 0) { //------------------------------------cell is empty but player has a number
    popupDiv.innerHTML = `
                <div>there is currrently nothing in this cell. Do you want to place your ${player.numberHeld} in the cell?</div>
                <button id="interact">Place</button>`;
    popupDiv
      .querySelector<HTMLButtonElement>("#interact")!
      .addEventListener("click", () => {
        currentCell.value = player.numberHeld;
        player.numberHeld = 0;
        updateInventory();
        currentCell.rect.closePopup();
      });
  } else if (currentCell.value == 0) { //--------------------------------------------cell is empty and player does not have a number
    popupDiv.innerHTML = `
                <div>there is currrently nothing in this cell.</div>`;
  } else if (currentCell.value == player.numberHeld) { //------------------------------------------------cell has the same number as player
    popupDiv.innerHTML = `
      <div>There is a cache here at "${currentCell.i},${currentCell.j}". Would you like to spend your ${player.numberHeld} to place a ${
      player.numberHeld * 2
    }.</div>
      <button id="interact">craft</button>`;

    popupDiv
      .querySelector<HTMLButtonElement>("#interact")!
      .addEventListener("click", () => {
        currentCell.value = player.numberHeld * 2;
        player.numberHeld = 0;
        updateInventory();
        currentCell.rect.closePopup();
      });
  } else if (currentCell.value != 0 && player.numberHeld == 0) { // ---------------------------- player doesnt have anything but cell does
    popupDiv.innerHTML = `
                <div>There is a cache here at "${currentCell.i},${currentCell.j}". It has value ${currentCell.value}.</div>
                <button id="interact">Pick up?</button>`;

    popupDiv
      .querySelector<HTMLButtonElement>("#interact")!
      .addEventListener("click", () => {
        player.numberHeld = currentCell.value;
        currentCell.value = 0;
        updateInventory();
        currentCell.rect.closePopup();
      });
  } else { //------------------------------------------------------------------- player and cell does not hold the same non 0 number
    popupDiv.innerHTML = `
                You must have the same number as the cell to craft a bigger number`;
  }

  return popupDiv;
}

function updateTooltip(currentCell: Cell) {
  if (currentCell.value != 0) {
    currentCell.rect.bindTooltip(currentCell.value.toString(), {
      permanent: true,
      direction: "center",
      className: "cell-label",
      interactive: false,
    });
  } else {
    currentCell.rect.unbindTooltip();
  }
}

function latToCellI(lat: number): number {
  return Math.floor((lat - CLASSROOM_LATLNG.lat) / TILE_DEGREES);
}

function lngToCellJ(lng: number): number {
  return Math.floor((lng - CLASSROOM_LATLNG.lng) / TILE_DEGREES);
}

function makeMementoFromCell(cell: Cell): CellMemento {
  return {
    i: cell.i,
    j: cell.j,
    value: cell.value,
    originalvalue: cell.originalvalue,
  };
}

// Add caches to the map by cell number
function spawnCache(i: number, j: number, memento?: CellMemento) {
  // Convert cell numbers into lat/lng bounds
  const pointValue = memento ? memento.value : makeValue(i, j);

  const origin = CLASSROOM_LATLNG;
  const bounds = leaflet.latLngBounds([
    [origin.lat + i * TILE_DEGREES, origin.lng + j * TILE_DEGREES],
    [origin.lat + (i + 1) * TILE_DEGREES, origin.lng + (j + 1) * TILE_DEGREES],
  ]);

  // Add a rectangle to the map to represent the cache
  const rect = leaflet.rectangle(bounds);
  rect.addTo(map);

  const thisCell: Cell = {
    value: pointValue,
    i: i,
    j: j,
    originalvalue: memento ? memento.originalvalue : pointValue,
    rect: rect,
  };

  activeCells.set(cellKey(i, j), thisCell);

  //check if player is in bounds of box if not change it to red
  if (!isInRange(i, j)) {
    rect.setStyle({ color: "red" });
  }

  // Handle interactions with the cache
  rect.bindPopup(() => {
    return HandlePopup(thisCell);
  });

  rect.getPopup()?.on("remove", function () {
    rect.bindPopup(() => {
      return HandlePopup(thisCell);
    });
    updateTooltip(thisCell);
  });
  updateTooltip(thisCell);
}

// Look around the player's neighborhood for caches to spawn
for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
    spawnCache(i, j);
  }
}
