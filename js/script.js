'use strict';

const form = document.querySelector('.form');
const containerWorkouts = document.querySelector('.workouts');
const inputType = document.querySelector('.form__input--type');
const inputDistance = document.querySelector('.form__input--distance');
const inputDuration = document.querySelector('.form__input--duration');
const inputCadence = document.querySelector('.form__input--cadence');
const inputElevation = document.querySelector('.form__input--elevation');
const btnActions = document.querySelector('.list-actions');
const sortMenu = document.querySelector('.sort-menu');
const btnShowAll = document.querySelector('.btn-show-all');
const btnDrawRoute = document.querySelector('.btn-draw-route');
const drawPanel = document.querySelector('.draw-panel');
const actionsPanel = document.querySelector('.draw-panel__actions');
const btnFinishRoute = document.querySelector('.btn-finish-route');
const firstPanel = document.querySelector('.first-panel');
const modal = document.querySelector('.modal');
const overlay = document.querySelector('.overlay');
const btnCloseModal = document.querySelector('.close-modal');
const btnsOpenModal = document.querySelector('.show-modal');
const modalTitle = document.querySelector('.modal-title');
const modalDesc = document.querySelector('.modal-description');
const btnModals = document.querySelector('.modal-btns');

class Workout {
  date = new Date();
  id = crypto.randomUUID();
  constructor(distance, duration, coords, route) {
    this.route = route;
    this.coords = coords;
    this.distance = distance;
    this.duration = duration;
  }

  _setDescription() {
    // prettier-ignore
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    this.description = `${this.type[0].toUpperCase()}${this.type.slice(1)} on ${months[this.date.getMonth()]} ${this.date.getDate()}`;
  }
}

class Running extends Workout {
  type = 'running';
  constructor(distance, duration, coords, cadence, route) {
    super(distance, duration, coords, route);
    this.cadence = cadence;
    this.calcPace();
    this._setDescription();
  }

  calcPace() {
    this.pace = this.duration / this.distance;
    return this.pace;
  }
}

class Cycling extends Workout {
  type = 'cycling';
  constructor(distance, duration, coords, elevationGain, route) {
    super(distance, duration, coords, route);
    this.elevationGain = elevationGain;
    this.calcSpeed();
    this._setDescription();
  }

  calcSpeed() {
    this.speed = this.distance / (this.duration / 60);
    return this.speed;
  }
}

class App {
  #workouts = [];
  #map;
  #mapEvent;
  #markers = new Map();
  #editMode = false;
  #editingWorkout;
  #drawingMode = false;
  #drawnRoute = [];
  #currentPolyline;
  #selectedWorkoutID = null;
  #selectedMarker;
  #sortOn = false;
  #confirmResolver = null;

  constructor() {
    this._getPosition();

    this._loadWorkouts();

    form.addEventListener('submit', this._submitForm.bind(this));
    form.addEventListener('keydown', e => {
      if (e.key === 'Escape') this._hideForm();
    });

    inputType.addEventListener('change', () => {
      this._toggleElevationField(inputType.value);
    });
    containerWorkouts.addEventListener('click', this._moveToPopUp.bind(this));
    containerWorkouts.addEventListener(
      'click',
      this._workoutActions.bind(this),
    );
    containerWorkouts.addEventListener(
      'mouseover',
      this._highlightWorkoutMarker.bind(this),
    );
    containerWorkouts.addEventListener(
      'mouseout',
      this._mouseOutHighlight.bind(this),
    );
    btnActions.addEventListener('click', this._btnListActions.bind(this));
    sortMenu.addEventListener('click', this._handleSort.bind(this));
    btnShowAll.addEventListener('click', this._showAllMarkers.bind(this));
    btnDrawRoute.addEventListener('click', this._showDrawPanel.bind(this));
    actionsPanel.addEventListener('click', this._btnActionsPanel.bind(this));

    this._toggleListActions();

    btnCloseModal.addEventListener('click', this._closeModal);
    overlay.addEventListener('click', this._closeModal);
    btnModals.addEventListener('click', this._handleModal.bind(this));
  }

  _toggleListActions() {
    btnActions.classList.toggle('hidden', this.#workouts.length === 0);
    firstPanel.classList.toggle('hidden', this.#workouts.length > 0);
  }

  _getPosition() {
    // GeoLocation API
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(this._loadMap.bind(this), () =>
        this._showNotification('Could Not get your location...', 'error'),
      );
    }
  }

  _loadMap(position) {
    const { latitude } = position.coords;
    const { longitude } = position.coords;
    const coords = [latitude, longitude];

    //Leaflet for Maps OPEN-SOURCE LIBRARY
    this.#map = L.map('map').setView(coords, 15);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.#map);
    this.#map.on('click', this._showForm.bind(this));
    this.#map.on('click', this._drawRoute.bind(this));
    this.#map.on('click', () => {
      this._clearWorkoutHighlights();
      this.#selectedWorkoutID = null;
      this._clearMarkerHighlight();
    });

    this.#workouts.forEach(work => {
      this._renderWorkoutMarker(work);
    });
  }

  _showForm(mapE) {
    if (this.#drawingMode || this.#editMode) return;
    this._clearPolyline();
    this.#mapEvent = mapE;
    form.classList.remove('hidden');
    inputDistance.focus();
  }

  _hideForm() {
    inputDistance.value =
      inputDuration.value =
      inputCadence.value =
      inputElevation.value =
        '';

    form.classList.add('hidden');
    form.style.display = 'grid';

    this._clearTransientUI();
  }

  _toggleElevationField(type) {
    if (type === 'running') {
      inputCadence.closest('.form__row').classList.remove('form__row--hidden');
      inputElevation.closest('.form__row').classList.add('form__row--hidden');
    }

    if (type === 'cycling') {
      inputCadence.closest('.form__row').classList.add('form__row--hidden');
      inputElevation
        .closest('.form__row')
        .classList.remove('form__row--hidden');
    }
  }

  _submitForm(e) {
    const validInputs = (...inputs) =>
      inputs.every(inp => Number.isFinite(inp));
    const allPositive = (...inputs) => inputs.every(inp => inp > 0);

    e.preventDefault();

    const distance = +inputDistance.value;
    const duration = +inputDuration.value;
    const type = inputType.value;

    let data;

    if (type === 'running') {
      const cadence = +inputCadence.value;
      if (
        !validInputs(cadence, duration, distance) ||
        !allPositive(duration, distance, cadence)
      )
        return this._showNotification(
          'Inputs have to be positive numbers!',
          'error',
        );

      data = {
        type,
        distance,
        duration,
        cadence,
      };
    }
    if (type === 'cycling') {
      const elevation = +inputElevation.value;
      if (
        !validInputs(elevation, duration, distance) ||
        !allPositive(duration, distance)
      )
        return alert('Inputs have to be positive numbers!');

      data = {
        type,
        distance,
        duration,
        elevation,
      };
    }

    if (this.#editMode) {
      this.#drawnRoute = [];
      this._editWorkout(this.#editingWorkout.id, data);
      this._clearTransientUI();
      return;
    } else if (this.#drawnRoute.length !== 0) {
      data.route = this.#drawnRoute.slice();
      data.coords = [this.#drawnRoute[0][0], this.#drawnRoute[0][1]];
      this._newWorkout(data);
      this.#drawnRoute.splice(0, this.#drawnRoute.length);
    } else {
      const { lat, lng } = this.#mapEvent.latlng;
      data.coords = [lat, lng];
      this._newWorkout(data);
    }
  }

  _editWorkout(id, data) {
    const workout = this.#workouts.find(w => w.id === id);

    workout.distance = data.distance;
    workout.duration = data.duration;

    if (workout.type === 'running') {
      workout.cadence = data.cadence;

      delete workout.elevationGain;

      workout.calcPace();
    }

    if (workout.type === 'cycling') {
      workout.elevationGain = data.elevation;

      delete workout.cadence;

      workout.calcSpeed();
    }

    this._saveWorkouts();
    document
      .querySelectorAll('.workout--editing')
      .forEach(el => el.classList.remove('workout--editing'));

    this._hideForm();
    this._renderAllWorkouts();
  }

  _newWorkout(data) {
    let workout;
    if (data.type === 'running') {
      data.route = data.route || [];
      workout = new Running(
        data.distance,
        data.duration,
        data.coords,
        data.cadence,
        data.route,
      );
    }
    if (data.type === 'cycling') {
      data.route = data.route || [];
      workout = new Cycling(
        data.distance,
        data.duration,
        data.coords,
        data.elevation,
        data.route,
      );
    }

    this.#workouts.push(workout);
    this._toggleListActions();

    this._renderWorkoutMarker(workout);

    //Render List
    this._renderWorkout(workout);

    this._hideForm();
    this._saveWorkouts();
    this._showNotification('Workout created successfully', 'success');
  }

  _renderWorkoutMarker(workout) {
    //Display Marker

    const marker = L.marker(workout.coords)
      .addTo(this.#map)
      .bindPopup(
        L.popup({
          maxWidht: 250,
          minWidht: 100,
          autoClose: false,
          closeOnClick: false,
          className: `${workout.type}-popup`,
        }),
      )
      .setPopupContent(
        `${workout.type === 'running' ? '🏃‍♂️' : '🚴‍♀️'} ${workout.description}`,
      )
      .openPopup();

    this.#markers.set(workout.id, marker);
  }

  _renderAllWorkouts() {
    containerWorkouts.innerHTML = '';

    this.#workouts.forEach(work => {
      this._renderWorkout(work);
    });
  }

  _renderWorkout(workout) {
    let html = `<li class="workout workout--${workout.type}" data-id="${workout.id}">
          <h2 class="workout__title">${workout.type === 'running' ? '🏃‍♂️' : '🚴‍♀️'}${workout.description}
          <span class="workout__actions">
            <button class="workout__btn workout__btn--edit">Edit</button>
            <button class="workout__btn workout__btn--delete">Delete</button>
          </span>
          </h2>
          
          <div class="workout__details">
            <span class="workout__icon">${workout.type === 'running' ? '🏃‍♂️' : '🚴‍♀️'}</span>
            <span class="workout__value">${workout.distance}</span>
            <span class="workout__unit">km</span>
          </div>
          <div class="workout__details">
            <span class="workout__icon">⏱</span>
            <span class="workout__value">${workout.duration}</span>
            <span class="workout__unit">min</span>
          </div>
          `;

    if (workout.type === 'running') {
      html += `<div class="workout__details">
            <span class="workout__icon">⚡️</span>
            <span class="workout__value">${workout.pace.toFixed(1)}</span>
            <span class="workout__unit">min/km</span>
          </div>
          <div class="workout__details">
            <span class="workout__icon">🦶🏼</span>
            <span class="workout__value">${workout.cadence}</span>
            <span class="workout__unit">spm</span>
          </div>
        </li>`;
    }

    if (workout.type === 'cycling') {
      html += `<div class="workout__details">
            <span class="workout__icon">⚡️</span>
            <span class="workout__value">${workout.speed.toFixed(1)}</span>
            <span class="workout__unit">km/h</span>
          </div>
          <div class="workout__details">
            <span class="workout__icon">⛰</span>
            <span class="workout__value">${workout.elevationGain}</span>
            <span class="workout__unit">m</span>
          </div>
        </li>`;
    }

    containerWorkouts.insertAdjacentHTML('afterbegin', html);
  }

  _moveToPopUp(e) {
    if (e.target.closest('.workout__btn')) return;

    const workoutEl = e.target.closest('.workout');
    if (!workoutEl) return;

    const workout = this.#workouts.find(w => w.id === workoutEl.dataset.id);

    this._updateSelection(workout);

    this.#map.setView(workout.coords, 15, {
      animate: true,
      pan: { duration: 1 },
    });
  }

  _updateSelection(workout) {
    this.#selectedWorkoutID = workout.id;

    this._clearPolyline();
    this._drawPolyline(workout);

    document.querySelectorAll('.workout').forEach(el => {
      el.classList.remove('workout--highlighted-running');
      el.classList.remove('workout--highlighted-cycling');
    });

    const el = document.querySelector(`[data-id="${workout.id}"]`);
    el?.classList.add(`workout--highlighted-${workout.type}`);

    this._setMarkerHighlight(workout);

    this.#selectedMarker = this.#markers.get(workout.id);
  }

  _drawPolyline(workout) {
    if (!workout.route?.length) return;

    this.#currentPolyline = L.polyline(workout.route, {
      color: workout.type === 'running' ? '#00c46a' : '#ffb545',
      weight: '6',
    }).addTo(this.#map);
  }

  _workoutActions = async e => {
    if (this.#drawingMode) return;
    const deleteBtn = e.target.closest('.workout__btn--delete');
    const editBtn = e.target.closest('.workout__btn--edit');

    const workoutEl = e.target.closest('.workout');

    if (deleteBtn) {
      const ok = await this._openModal(
        'Delete Workout',
        'Are you sure you want to delete this workout?',
      );

      if (!ok) return;

      const index = this.#workouts.findIndex(
        work => work.id === workoutEl.dataset.id,
      );

      const workout = this.#workouts[index];

      // remove marker from map
      const marker = this.#markers.get(workout.id);

      if (marker) {
        this.#map.removeLayer(marker);
        this.#markers.delete(workout.id);
      }

      // remove from array
      this.#workouts.splice(index, 1);
      this._toggleListActions();
      this._clearPolyline();

      // remove from DOM
      workoutEl.remove();

      this._saveWorkouts();
      this._showNotification('Workout deleted!', 'success');

      this.#selectedWorkoutID = null;
      this._clearMarkerHighlight();
      this._clearWorkoutHighlights();
    }

    if (editBtn) {
      const workout = this.#workouts.find(w => w.id === workoutEl.dataset.id);

      this._updateSelection(workout);
      this.#editMode = true;
      this.#editingWorkout = workout;

      this._showFormToEdit(workout);
    }
  };

  _clearWorkoutHighlights() {
    this.#selectedWorkoutID = null;
    document.querySelectorAll('.workout').forEach(el => {
      el.classList.remove('workout--highlighted-running');
      el.classList.remove('workout--highlighted-cycling');
    });
  }

  _clearMarkerHighlight() {
    document.querySelectorAll('.leaflet-popup').forEach(pop => {
      pop.classList.remove('popup-highlighted-running');
      pop.classList.remove('popup-highlighted-cycling');
    });
  }

  _setMarkerHighlight(workout) {
    this._clearMarkerHighlight();

    if (!workout) return;

    const marker = this.#markers.get(workout.id);
    if (!marker) return;

    const popupNode = marker.getPopup().getElement();
    popupNode?.classList.add(`popup-highlighted-${workout.type}`);
  }

  _highlightWorkoutMarker(e) {
    const workoutEl = e.target.closest('.workout');
    if (!workoutEl) return;

    const workout = this.#workouts.find(w => w.id === workoutEl.dataset.id);

    this._setMarkerHighlight(workout);
  }

  _mouseOutHighlight(e) {
    const workoutEl = e.target.closest('.workout');
    if (!workoutEl) return;

    const selected = this.#workouts.find(w => w.id === this.#selectedWorkoutID);

    if (!selected) {
      this._clearMarkerHighlight();
      return;
    }

    this._setMarkerHighlight(selected);
  }

  _showFormToEdit(workout) {
    this._clearTransientUI();
    this._clearPolyline();

    this.#editMode = true;
    this.#editingWorkout = workout;

    inputDistance.focus();

    inputDistance.value = workout.distance;
    inputDuration.value = workout.duration;
    inputType.value = workout.type;
    this._toggleElevationField(workout.type);

    if (workout.type === 'running') {
      inputCadence.value = workout.cadence;
    }

    if (workout.type === 'cycling') {
      inputElevation.value = workout.elevationGain;
    }
  }

  _btnListActions = async e => {
    const btnDelete = e.target.closest('.btn-delete-all');
    const btnSort = e.target.closest('.btn-sort');

    if (btnDelete) {
      const ok = await this._openModal(
        'Delete All Workouts',
        'Are you sure you want to delete all workouts?',
      );

      if (!ok) return;

      this.#markers.forEach(marker => {
        if (marker) {
          this.#map.removeLayer(marker);
        }
      });

      this.#markers.clear();

      this.#workouts = [];

      this._reset();
      this._showNotification('All Workouts Deleted', 'warning');
    }
    if (btnSort) {
      sortMenu.classList.toggle('hidden');
      this.#sortOn = true;
    }
  };

  _handleSort(e) {
    const sortType = e.target.dataset.sort;
    if (!sortType) return;

    let sorted = [...this.#workouts];

    if (sortType === 'distance-asc') {
      sorted.sort((a, b) => a.distance - b.distance);
    }

    if (sortType === 'distance-desc') {
      sorted.sort((a, b) => b.distance - a.distance);
    }

    if (sortType === 'duration-asc') {
      sorted.sort((a, b) => a.duration - b.duration);
    }

    if (sortType === 'duration-desc') {
      sorted.sort((a, b) => b.duration - a.duration);
    }

    if (sortType === 'original') {
      sorted = this.#workouts;
    }

    sortMenu.classList.toggle('hidden');
    document.querySelectorAll('.workout').forEach(el => el.remove());

    sorted.forEach(work => {
      this._renderWorkout(work);
    });
  }

  _showAllMarkers() {
    if (this.#workouts.length === 0) return;
    const bounds = L.latLngBounds();

    this.#markers.forEach(marker => {
      bounds.extend(marker.getLatLng());
    });

    this.#workouts.forEach(w => {
      if (w.route?.length) {
        w.route.forEach(coord => bounds.extend(coord));
      }
    });

    this.#map.fitBounds(bounds, {
      padding: [60, 60],
      maxZoom: 15,
    });
  }

  _showDrawPanel() {
    if (this.#editMode) return;

    this._clearTransientUI();
    this.#drawingMode = true;

    containerWorkouts.classList.add('drawing-mode');
    drawPanel.classList.remove('hidden');
  }

  _hideDrawPanel() {
    this.#drawingMode = false;

    containerWorkouts.classList.remove('drawing-mode');

    drawPanel.classList.add('hidden');
  }

  _btnActionsPanel(e) {
    const btnCancel = e.target.closest('.btn-cancel-route');
    const btnFinish = e.target.closest('.btn-finish-route');

    if (btnCancel) {
      this._hideDrawPanel();
      this.#drawingMode = false;
      this._clearPolyline();
      this.#drawnRoute = [];
      btnFinishRoute.classList.add('hidden');
    }

    if (btnFinish) {
      this.#drawingMode = false;
      this._hideDrawPanel();
      this._showForm();
      btnFinishRoute.classList.add('hidden');
    }
  }

  _clearPolyline() {
    if (this.#currentPolyline) {
      this.#currentPolyline.removeFrom(this.#map);
      this.#currentPolyline = null;
    }
  }

  _drawRoute(mapE) {
    if (!this.#drawingMode || this.#editMode) return;
    this.#mapEvent = mapE;
    const { lat, lng } = this.#mapEvent.latlng;
    this.#drawnRoute.push([lat, lng]);
    btnFinishRoute.classList.remove('hidden');

    if (!this.#currentPolyline) {
      this.#currentPolyline = L.polyline(this.#drawnRoute, {
        color: 'black',
      }).addTo(this.#map);
    } else {
      this.#currentPolyline.setLatLngs(this.#drawnRoute);
    }
  }

  _showNotification(message, type = 'info') {
    const container = document.querySelector('.notifications');

    const html = `
    <div class="notification notification--${type}">
      ${message}
    </div>
  `;

    container.insertAdjacentHTML('beforeend', html);

    const notification = container.lastElementChild;

    setTimeout(() => {
      notification.classList.add('hide');

      notification.addEventListener('animationend', () => {
        notification.remove();
      });
    }, 3000);
  }

  _saveWorkouts = function () {
    localStorage.setItem('workouts', JSON.stringify(this.#workouts));
  };

  _loadWorkouts = function () {
    const savedWorkouts = JSON.parse(localStorage.getItem('workouts'));

    if (!savedWorkouts) return;

    this.#workouts = savedWorkouts.map(w =>
      w.type === 'running'
        ? new Running(w.distance, w.duration, w.coords, w.cadence, w.route)
        : new Cycling(
            w.distance,
            w.duration,
            w.coords,
            w.elevationGain,
            w.route,
          ),
    );

    this._toggleListActions();
    this.#workouts.forEach(work => {
      this._renderWorkout(work);
    });
  };

  _reset() {
    localStorage.removeItem('workouts');

    this._clearTransientUI();

    this.#workouts = [];

    this.#markers.forEach(marker => this.#map.removeLayer(marker));
    this.#markers.clear();

    containerWorkouts.innerHTML = '';
    this._toggleListActions();
  }

  _openModal(title, description) {
    modal.classList.remove('hidden');
    overlay.classList.remove('hidden');
    modalDesc.textContent = description;
    modalTitle.textContent = title;

    return new Promise(resolve => {
      this.#confirmResolver = resolve;
    });
  }

  _closeModal() {
    modal.classList.add('hidden');
    overlay.classList.add('hidden');
    modalDesc.textContent = modalTitle.textContent = '';
  }

  _handleModal(e) {
    const btnCancel = e.target.closest('.btn-cancel');
    const btnConfirm = e.target.closest('.btn-confirm');

    if (btnCancel) {
      this._closeModal();
      this.#confirmResolver?.(false);
      this.#confirmResolver = null;
    }

    if (btnConfirm) {
      this._closeModal();
      this.#confirmResolver?.(true);
      this.#confirmResolver = null;
    }
  }

  _clearTransientUI() {
    // edit
    this.#editMode = false;
    this.#editingWorkout = null;

    document
      .querySelectorAll('.workout--editing')
      .forEach(el => el.classList.remove('workout--editing'));

    // draw
    this.#drawingMode = false;
    this.#drawnRoute = [];
    this._clearPolyline();

    drawPanel.classList.add('hidden');
    containerWorkouts.classList.remove('drawing-mode');

    // selection
    this.#selectedWorkoutID = null;

    // form safety
    form.classList.add('hidden');
  }
}

const app = new App();
