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
  rect: leaflet.Rectangle;
}

const activeCells: Array<Cell> = [];

let numberHeld: number = 0;

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
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 21;
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
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

// Add a marker to represent the player
const playerMarker = leaflet.marker(CLASSROOM_LATLNG);
playerMarker.bindTooltip("You!");
playerMarker.addTo(map);

// Display the player's points
statusPanelDiv.innerHTML = "You are not holding anything";

function updateInventory() {
  if (numberHeld != 0) {
    statusPanelDiv.innerHTML = `You are holding the number = ${numberHeld}`;
  } else {
    statusPanelDiv.innerHTML = "You are not holding anything";
  }
}

function makeValue(i: number, j: number): number {
  const rng = luck([i, j, "initialValue"].toString());

  if (rng < .3) {
    return 0;
  } else if (rng < .7) {
    return 1;
  } else if (rng < .9) {
    return 2;
  } else {
    return 4;
  }
}

function isInRange(i: number, j: number): boolean {
  if (Math.sqrt(i ** 2 + j ** 2) < PLAYER_RANGE) {
    return true;
  }
  return false;
}

function HandlePopup(currentCell: Cell): HTMLDivElement {
  const popupDiv = document.createElement("div");

  // set popup based on state of player and box
  if (!isInRange) { //----------------------------------------------------------------------------------------player is not in range
    popupDiv.innerHTML = `
                <div>You are not in range!</div>`;
  } else if (currentCell.value == 0 && numberHeld != 0) { //------------------------------------cell is empty but player has a number
    popupDiv.innerHTML = `
                <div>there is currrently nothing in this cell. Do you want to place your ${numberHeld} in the cell?</div>
                <button id="interact">Place</button>`;
    popupDiv
      .querySelector<HTMLButtonElement>("#interact")!
      .addEventListener("click", () => {
        currentCell.value = numberHeld;
        numberHeld = 0;
        updateInventory();
        currentCell.rect.closePopup();
      });
  } else if (currentCell.value == 0) { //--------------------------------------------cell is empty and player does not have a number
    popupDiv.innerHTML = `
                <div>there is currrently nothing in this cell.</div>`;
  } else if (currentCell.value == numberHeld) { //------------------------------------------------cell has the same number as player
    popupDiv.innerHTML = `
      <div>There is a cache here at "${currentCell.i},${currentCell.j}". Would you like to spend your ${numberHeld} to place a ${
      numberHeld * 2
    }.</div>
      <button id="interact">craft</button>`;

    popupDiv
      .querySelector<HTMLButtonElement>("#interact")!
      .addEventListener("click", () => {
        currentCell.value = numberHeld * 2;
        numberHeld = 0;
        updateInventory();
        currentCell.rect.closePopup();
      });
  } else if (currentCell.value != 0 && numberHeld == 0) { // ---------------------------- player doesnt have anything but cell does
    popupDiv.innerHTML = `
                <div>There is a cache here at "${currentCell.i},${currentCell.j}". It has value ${currentCell.value}.</div>
                <button id="interact">Pick up?</button>`;

    popupDiv
      .querySelector<HTMLButtonElement>("#interact")!
      .addEventListener("click", () => {
        numberHeld = currentCell.value;
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

// Add caches to the map by cell number
function spawnCache(i: number, j: number) {
  // Convert cell numbers into lat/lng bounds

  const origin = CLASSROOM_LATLNG;
  const bounds = leaflet.latLngBounds([
    [origin.lat + i * TILE_DEGREES, origin.lng + j * TILE_DEGREES],
    [origin.lat + (i + 1) * TILE_DEGREES, origin.lng + (j + 1) * TILE_DEGREES],
  ]);

  // Add a rectangle to the map to represent the cache
  const rect = leaflet.rectangle(bounds);
  rect.addTo(map);

  const pointValue = makeValue(i, j);

  const thisCell: Cell = {
    value: pointValue,
    i: i,
    j: j,
    rect: rect,
  };

  activeCells.push(thisCell);

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
