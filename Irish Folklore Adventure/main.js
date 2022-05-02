import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';

import {FBXLoader} from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/loaders/FBXLoader.js';
import {GLTFLoader} from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/loaders/GLTFLoader.js';
// Flag to on/off to show bounding boxes
const showBoundingBoxes = false;


class BasicCharacterControllerProxy {
  constructor(animations) {
    this._animations = animations;
  }

  get animations() {
    return this._animations;
  }
};


class BasicCharacterController {
  constructor(params) {
    this._Init(params);
  }

  _Init(params) {
    this._params = params;
    this._decceleration = new THREE.Vector3(-0.0005, -0.0001, -5.0);
    this._acceleration = new THREE.Vector3(1, 0.25, 50.0);
    this._velocity = new THREE.Vector3(0, 0, 0);
    this._position = new THREE.Vector3();

    this._animations = {};
    this._input = new BasicCharacterControllerInput();
    this._stateMachine = new CharacterFSM(
        new BasicCharacterControllerProxy(this._animations));

    this._LoadModels();
  }

  _LoadModels() {
    const loader = new FBXLoader();
    loader.setPath('./resources/Female Warrior/');
    loader.load('akai_e_espiritu.fbx', (fbx) => {
      fbx.scale.setScalar(0.1);
      fbx.traverse(c => {
        c.castShadow = true;
      });

      this._target = fbx;
      this._params.scene.add(this._target);
      if (showBoundingBoxes == true)
      {
        this._characterBBoxHelper = new THREE.BoxHelper(this._target, 0x00ff00);
        this._params.scene.add(this._characterBBoxHelper);
      }
      this._characterBBox = new THREE.Box3();
      this._characterBBox.setFromObject(this._target);
      this._mixer = new THREE.AnimationMixer(this._target);

      this._manager = new THREE.LoadingManager();
      this._manager.onLoad = () => {
        this._stateMachine.SetState('idle');
      };

      const _OnLoad = (animName, anim) => {
        const clip = anim.animations[0];
        const action = this._mixer.clipAction(clip);
  
        this._animations[animName] = {
          clip: clip,
          action: action,
        };
      };
      // Make sure animations are done in place
      const loader = new FBXLoader(this._manager);
      loader.setPath('./resources/Female Warrior/');
      loader.load('Catwalk Walk Forward-InPlace.fbx', (a) => { _OnLoad('walk-forward', a); });
      loader.load('Standing Walk Back-InPlace.fbx', (a) => { _OnLoad('walk-backward', a); });
      loader.load('Standing Run Forward-InPlace.fbx', (a) => { _OnLoad('run-forward', a); });
      loader.load('Standing Run Back-InPlace.fbx', (a) => { _OnLoad('run-backward', a); });
      loader.load('Catwalk Idle.fbx', (a) => { _OnLoad('idle', a); });
      
    });
  }

  get Position() {
    return this._position;
  }

  get Rotation() {
    if (!this._target) {
      return new THREE.Quaternion();
    }
    return this._target.quaternion;
  }

  Update(timeInSeconds) {
    if (!this._stateMachine._currentState) {
      return;
    }

    this._stateMachine.Update(timeInSeconds, this._input);

    const velocity = this._velocity;
    const frameDecceleration = new THREE.Vector3(
        velocity.x * this._decceleration.x,
        velocity.y * this._decceleration.y,
        velocity.z * this._decceleration.z
    );
    frameDecceleration.multiplyScalar(timeInSeconds);
    frameDecceleration.z = Math.sign(frameDecceleration.z) * Math.min(
        Math.abs(frameDecceleration.z), Math.abs(velocity.z));

    velocity.add(frameDecceleration);

    const controlObject = this._target;
    const _Q = new THREE.Quaternion();
    const _A = new THREE.Vector3();
    const _R = controlObject.quaternion.clone();

    const acc = this._acceleration.clone();
    if (this._input._keys.shift) {
      acc.multiplyScalar(2.0);
    }

   

    if (this._input._keys.forward) {
      velocity.z += acc.z * timeInSeconds;
    }
    if (this._input._keys.backward) {
      velocity.z -= acc.z * timeInSeconds;
    }
    if (this._input._keys.left) {
      _A.set(0, 1, 0);
      _Q.setFromAxisAngle(_A, 4.0 * Math.PI * timeInSeconds * this._acceleration.y);
      _R.multiply(_Q);
    }
    if (this._input._keys.right) {
      _A.set(0, 1, 0);
      _Q.setFromAxisAngle(_A, 4.0 * -Math.PI * timeInSeconds * this._acceleration.y);
      _R.multiply(_Q);
    }

    controlObject.quaternion.copy(_R);

    const oldPosition = new THREE.Vector3();
    oldPosition.copy(controlObject.position);

    const forward = new THREE.Vector3(0, 0, 1);
    forward.applyQuaternion(controlObject.quaternion);
    forward.normalize();

    const sideways = new THREE.Vector3(1, 0, 0);
    sideways.applyQuaternion(controlObject.quaternion);
    sideways.normalize();

    sideways.multiplyScalar(velocity.x * timeInSeconds);
    forward.multiplyScalar(velocity.z * timeInSeconds);

    controlObject.position.add(forward);
    controlObject.position.add(sideways);
    if (showBoundingBoxes == true)
    {
      this._characterBBoxHelper.update();
    }
    this._characterBBox.setFromObject(controlObject);

    
    this._DetectCollisions(controlObject.position);

    this._position.copy(controlObject.position);
    
    this._UpdateScorePosition(controlObject);

    if (this._mixer) {
      this._mixer.update(timeInSeconds);
    }
  }
 // Update score position
  _UpdateScorePosition(characterController)
  {
    const idealScorePosition = new THREE.Vector3(0,30,10);
    idealScorePosition.applyQuaternion(characterController.quaternion);
    idealScorePosition.add(characterController.position);
    // Apply to Score Text
    this._params.scoreText.position.set(idealScorePosition.x, idealScorePosition.y, idealScorePosition.z);
    this._params.scoreText.quaternion.copy(characterController.quaternion);
  }
  /**
 * Collision detection for every solid object.
 */
  _DetectCollisions(currentLocation) 
 {
   
  // Run through each object and detect if there is a collision.
  for ( var index = 0; index < this._params.collisions.length; index ++ ) {
 
    if (this._params.collisions[ index ].type == 'collision' || this._params.collisions[ index ].type == 'reward' ) 
    {
      var objectBoundingBox = new THREE.Box3(new THREE.Vector3(this._params.collisions[ index ].xMin, this._params.collisions[ index ].yMin, this._params.collisions[ index ].zMin),
                                             new THREE.Vector3(this._params.collisions[ index ].xMax, this._params.collisions[ index ].yMax, this._params.collisions[ index ].zMax));
                                           
      if (this._characterBBox.intersectsBox(objectBoundingBox)) 
      {
        if (this._params.collisions[ index ].type == 'collision')
        {

        
          // We hit a solid object! Stop all movements.
          this._stateMachine.SetState('idle');
  
          var objectCenter = new THREE.Vector3();
          var playerCenter = new THREE.Vector3();
          objectBoundingBox.getCenter(objectCenter);
          objectBoundingBox.getCenter(playerCenter);
          // Move the object in the clear. Detect the best direction to move.
          if ( this._characterBBox.min.x <= objectBoundingBox.max.x && this._characterBBox.max.x >= objectBoundingBox.min.x ) 
          {
            // Determine the X axis push.
            if (objectCenter.x > playerCenter.x) 
            {
              currentLocation.x -= 1;
            } 
            else 
            {
              currentLocation.x += 1;
            }
          }
          if ( this._characterBBox.min.z <= objectBoundingBox.max.z && this._characterBBox.max.z >= objectBoundingBox.min.z )  {
            // Determine the Z axis push.
            if (objectCenter.z > playerCenter.z) 
            {
              currentLocation.z -= 1;
            } 
            else 
            {
              currentLocation.z += 1;
            }
          }
        }
        else if ( this._params.collisions[ index ].type == 'reward' )
        {
          this._params.collisions[ index ].type = 'no-reward'
          this._params.scene.remove(this._params.scoreText)
          this._params.scene.remove(this._params.collisions[ index ].mesh)
          this._params.score += 100;
          this._params.scoreText =  dcText("Score: " + this._params.score, 10, 10, 20, 0xff00ff)
          this._params.scoreText.position.set(this._position.x + 0, this._position.y + 45, this._position.z + 50);
          this._params.scene.add(this._params.scoreText)
          
        }
      }
    }
  }
}

};

class BasicCharacterControllerInput {
  constructor() {
    this._Init();    
  }

  _Init() {
    this._keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      space: false,
      shift: false,
    };
    document.addEventListener('keydown', (e) => this._onKeyDown(e), false);
    document.addEventListener('keyup', (e) => this._onKeyUp(e), false);
  }

  _onKeyDown(event) {
    switch (event.keyCode) {
      case 38: // up arrow 
        this._keys.forward = true;
        break;
      case 37: // left arrow
        this._keys.left = true;
        break;
      case 40: // down arrow
        this._keys.backward = true;
        break;
      case 39: // right arrow
        this._keys.right = true;
        break;
      case 32: // SPACE
        this._keys.space = true;
        break;
      case 16: // SHIFT
        this._keys.shift = true;
        break;
    }
  }

  _onKeyUp(event) {
    switch(event.keyCode) {
      case 38: // up arrow 
        this._keys.forward = false;
        break;
      case 37: // left arrow
        this._keys.left = false;
        break;
      case 40: // down arrow
        this._keys.backward = false;
        break;
      case 39: // right arrow
        this._keys.right = false;
        break;
      case 32: // SPACE
        this._keys.space = false;
        break;
      case 16: // SHIFT
        this._keys.shift = false;
        break;
    }
  }
};


class FiniteStateMachine {
  constructor() {
    this._states = {};
    this._currentState = null;
  }

  _AddState(name, type) {
    this._states[name] = type;
  }

  SetState(name) {
    const prevState = this._currentState;
    
    if (prevState) {
      if (prevState.Name == name) {
        return;
      }
      prevState.Exit();
    }

    const state = new this._states[name](this);

    this._currentState = state;
    state.Enter(prevState);
  }

  Update(timeElapsed, input) {
    if (this._currentState) {
      this._currentState.Update(timeElapsed, input);
    }
  }
};


class CharacterFSM extends FiniteStateMachine {
  constructor(proxy) {
    super();
    this._proxy = proxy;
    this._Init();
  }

  _Init() {
    this._AddState('idle', IdleState);
    this._AddState('walk-forward', WalkForwardState);
    this._AddState('walk-backward', WalkBackwardState);
    this._AddState('run-forward', RunForwardState);
    this._AddState('run-backward', RunBackwardState);
  }
};


class State {
  constructor(parent) {
    this._parent = parent;
  }

  Enter() {}
  Exit() {}
  Update() {}
};


class DanceState extends State {
  constructor(parent) {
    super(parent);

    this._FinishedCallback = () => {
      this._Finished();
    }
  }

  get Name() {
    return 'dance';
  }

  Enter(prevState) {
    const curAction = this._parent._proxy._animations['dance'].action;
    const mixer = curAction.getMixer();
    mixer.addEventListener('finished', this._FinishedCallback);

    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;

      curAction.reset();  
      curAction.setLoop(THREE.LoopOnce, 1);
      curAction.clampWhenFinished = true;
      curAction.crossFadeFrom(prevAction, 0.2, true);
      curAction.play();
    } else {
      curAction.play();
    }
  }

  _Finished() {
    this._Cleanup();
    this._parent.SetState('idle');
  }

  _Cleanup() {
    const action = this._parent._proxy._animations['dance'].action;
    
    action.getMixer().removeEventListener('finished', this._CleanupCallback);
  }

  Exit() {
    this._Cleanup();
  }

  Update(_) {
  }
};


class WalkForwardState extends State {
  constructor(parent) {
    super(parent);
  }

  get Name() {
    return 'walk-forward';
  }

  Enter(prevState) {
    const curAction = this._parent._proxy._animations['walk-forward'].action;
    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;

      curAction.enabled = true;

      if (prevState.Name == 'run-forward' || prevState.Name == 'run-backward') {
        const ratio = curAction.getClip().duration / prevAction.getClip().duration;
        curAction.time = prevAction.time * ratio;
      } else {
        curAction.time = 0.0;
        curAction.setEffectiveTimeScale(1.0);
        curAction.setEffectiveWeight(1.0);
      }

      curAction.crossFadeFrom(prevAction, 0.5, true);
      curAction.play();
    } else {
      curAction.play();
    }
  }

  Exit() {
  }

  Update(timeElapsed, input) {
    if (input._keys.forward || input._keys.backward) 
    {
      if (input._keys.shift) 
      {
        if (input._keys.forward)
          this._parent.SetState('run-forward');
        else 
        {
          this._parent.SetState('run-backward');
        }
      }
      return;
    }

    this._parent.SetState('idle');
  }
};

class WalkBackwardState extends State {
  constructor(parent) {
    super(parent);
  }

  get Name() {
    return 'walk-backward';
  }

  Enter(prevState) {
    const curAction = this._parent._proxy._animations['walk-backward'].action;
    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;

      curAction.enabled = true;

      if (prevState.Name == 'run-forward'  || prevState.Name == 'run-backward') {
        const ratio = curAction.getClip().duration / prevAction.getClip().duration;
        curAction.time = prevAction.time * ratio;
      } else {
        curAction.time = 0.0;
        curAction.setEffectiveTimeScale(1.0);
        curAction.setEffectiveWeight(1.0);
      }

      curAction.crossFadeFrom(prevAction, 0.5, true);
      curAction.play();
    } else {
      curAction.play();
    }
  }

  Exit() {
  }

  Update(timeElapsed, input) {
    if (input._keys.forward || input._keys.backward) 
    {
      if (input._keys.shift) 
      {
        if (input._keys.forward)
          this._parent.SetState('run-forward');
        else 
        {
          this._parent.SetState('run-backward');
        }
      }
      return;
    }

    this._parent.SetState('idle');
  }
};

class RunBackwardState extends State {
  constructor(parent) {
    super(parent);
  }

  get Name() {
    return 'run-backward';
  }

  Enter(prevState) {
    const curAction = this._parent._proxy._animations['run-backward'].action;
    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;

      curAction.enabled = true;

      if (prevState.Name == 'walk-forward' || prevState.Name == 'walk-backward') {
        const ratio = curAction.getClip().duration / prevAction.getClip().duration;
        curAction.time = prevAction.time * ratio;
      } else {
        curAction.time = 0.0;
        curAction.setEffectiveTimeScale(1.0);
        curAction.setEffectiveWeight(1.0);
      }

      curAction.crossFadeFrom(prevAction, 0.5, true);
      curAction.play();
    } else {
      curAction.play();
    }
  }

  Exit() {
  }

  Update(timeElapsed, input) {
    if (input._keys.forward || input._keys.backward) {
      if (!input._keys.shift)
      {
        if (input._keys.forward) 
        {
          this._parent.SetState('walk-forward');
        }
        else
        {
          this._parent.SetState('walk-backward');
        }
      }
      return;
    }

    this._parent.SetState('idle');
  }
};

class RunForwardState extends State {
  constructor(parent) {
    super(parent);
  }

  get Name() {
    return 'run-forward';
  }

  Enter(prevState) {
    const curAction = this._parent._proxy._animations['run-forward'].action;
    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;

      curAction.enabled = true;

      if (prevState.Name == 'walk-forward' || prevState.Name == 'walk-backward') {
        const ratio = curAction.getClip().duration / prevAction.getClip().duration;
        curAction.time = prevAction.time * ratio;
      } else {
        curAction.time = 0.0;
        curAction.setEffectiveTimeScale(1.0);
        curAction.setEffectiveWeight(1.0);
      }

      curAction.crossFadeFrom(prevAction, 0.5, true);
      curAction.play();
    } else {
      curAction.play();
    }
  }

  Exit() {
  }

  Update(timeElapsed, input) {
    if (input._keys.forward || input._keys.backward) {
      if (!input._keys.shift)
      {
        if (input._keys.forward) 
        {
          this._parent.SetState('walk-forward');
        }
        else
        {
          this._parent.SetState('walk-backward');
        }
      }
      return;
    }

    this._parent.SetState('idle');
  }
};

class IdleState extends State {
  constructor(parent) {
    super(parent);
  }

  get Name() {
    return 'idle';
  }

  Enter(prevState) {
    const idleAction = this._parent._proxy._animations['idle'].action;
    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;
      idleAction.time = 0.0;
      idleAction.enabled = true;
      idleAction.setEffectiveTimeScale(1.0);
      idleAction.setEffectiveWeight(1.0);
      idleAction.crossFadeFrom(prevAction, 0.5, true);
      idleAction.play();
    } else {
      idleAction.play();
    }
  }

  Exit() {
  }

  Update(_, input) {
    if (input._keys.forward || input._keys.backward) 
    {
      if (input._keys.forward) 
      {
        this._parent.SetState('walk-forward');
      }
      else
      {
        this._parent.SetState('walk-backward');
      }
    }
    else if (input._keys.space) 
    {
      this._parent.SetState('dance');
    }
  }
};


class ThirdPersonCamera {
  constructor(params) {
    this._params = params;
    this._camera = params.camera;

    this._currentPosition = new THREE.Vector3();
    this._currentLookat = new THREE.Vector3();
  }

  _CalculateIdealOffset() {
    const idealOffset = new THREE.Vector3(-15, 20, -30);
    idealOffset.applyQuaternion(this._params.target.Rotation);
    idealOffset.add(this._params.target.Position);
    return idealOffset;
  }

  _CalculateIdealLookat() {
    const idealLookat = new THREE.Vector3(0, 10, 50);
    idealLookat.applyQuaternion(this._params.target.Rotation);
    idealLookat.add(this._params.target.Position);
    return idealLookat;
  }

  Update(timeElapsed) {
    const idealOffset = this._CalculateIdealOffset();
    const idealLookat = this._CalculateIdealLookat();

    // const t = 0.05;
    // const t = 4.0 * timeElapsed;
    const t = 1.0 - Math.pow(0.001, timeElapsed);

    this._currentPosition.lerp(idealOffset, t);
    this._currentLookat.lerp(idealLookat, t);

    this._camera.position.copy(this._currentPosition);
    this._camera.lookAt(this._currentLookat);
  }
}


class ThirdPersonCameraDemo {
  constructor() {
    this._Initialize();
  }
  _MaximumNumberOfClusters = 10;
  _NumberOfCoinsInLevel = 100;
  _CreateLevel1() {
    this._CreateFloor();
    this._CreateTree(300, 300, 50);
    this._CreateTree(800, -300, 50);
    this._CreateTree(-300, 800, 50);
    this._CreateTree(-800, -800, 50);
    //this._CreateRock(100, 100, 25);
    this._CreateCoin(0, 20);
    
    var numberOfClusters = Math.floor(Math.random() *  this._MaximumNumberOfClusters);
    for (let i = 0; i < numberOfClusters; i++) 
    {
        var treeXOffset = Math.floor(100 * Math.random());
        var treeYOffset = Math.floor(25 * Math.random());
        var treeSize =  Math.floor(10 * Math.random());
        this._CreateTree(300 +  treeXOffset, 300 + treeYOffset, 50 - treeSize);
        this._CreateTree(800 - treeXOffset, -300 - treeYOffset, 50 + treeSize);
        this._CreateTree(-300 + treeXOffset, 800 + treeYOffset, 50 + treeSize);
        this._CreateTree(-800 - treeXOffset, -800 - treeYOffset, 50 - treeSize);
        var rockXOffset = Math.floor(100 * Math.random());
        var rockYOffset = Math.floor(25 * Math.random());
        var rockSize = Math.floor(10 * Math.random());
        this._CreateRock(100 + rockXOffset, 100 - rockYOffset, 25 + rockSize);
    }   
    for(let i = 0; i < this._NumberOfCoinsInLevel; i++)
    {
      var coinXOffset = Math.floor(800 * Math.random());
      var coinZOffset = Math.floor(800 * Math.random());
      this._CreateCoin(coinXOffset , coinZOffset);
    }
  }
  _CreateLevel2() {
    this._CreateFloor();
    this._CreateTree(300, 300, 50);
    this._CreateTree(800, -300, 50);
    this._CreateTree(-300, 800, 50);
    this._CreateTree(-800, -800, 50);
    this._CreateRock(100, 100, 25);
    var numberOfClusters = Math.floor(Math.random() *  this._MaximumNumberOfClusters);
    for (let i = 0; i < numberOfClusters; i++) 
    {
        var treeXOffset = Math.floor(100 * Math.random());
        var treeYOffset = Math.floor(25 * Math.random());
        var treeSize =  Math.floor(10 * Math.random());
        this._CreateTree(300 +  treeXOffset, 300 + treeYOffset, 50 - treeSize);
        this._CreateTree(800 - treeXOffset, -300 - treeYOffset, 50 + treeSize);
        this._CreateTree(-300 + treeXOffset, 800 + treeYOffset, 50 + treeSize);
        this._CreateTree(-800 - treeXOffset, -800 - treeYOffset, 50 - treeSize);
        var rockXOffset = Math.floor(100 * Math.random());
        var rockYOffset = Math.floor(25 * Math.random());
        var rockSize = Math.floor(10 * Math.random());
        this._CreateRock(100 + rockXOffset, 100 - rockYOffset, 25 + rockSize);
    }
  }
  _CreateLevel3() {
    this._CreateFloor();
    this._CreateTree(300, 300, 50);
    this._CreateTree(800, -300, 50);
    this._CreateTree(-300, 800, 50);
    this._CreateTree(-800, -800, 50);
    this._CreateRock(100, 100, 25);
    var numberOfClusters = Math.floor(Math.random() *  this._MaximumNumberOfClusters);
    for (let i = 0; i < numberOfClusters; i++) 
    {
        var treeXOffset = Math.floor(100 * Math.random());
        var treeYOffset = Math.floor(25 * Math.random());
        var treeSize =  Math.floor(10 * Math.random());
        this._CreateTree(300 +  treeXOffset, 300 + treeYOffset, 50 - treeSize);
        this._CreateTree(800 - treeXOffset, -300 - treeYOffset, 50 + treeSize);
        this._CreateTree(-300 + treeXOffset, 800 + treeYOffset, 50 + treeSize);
        this._CreateTree(-800 - treeXOffset, -800 - treeYOffset, 50 - treeSize);
        var rockXOffset = Math.floor(100 * Math.random());
        var rockYOffset = Math.floor(25 * Math.random());
        var rockSize = Math.floor(10 * Math.random());
        this._CreateRock(100 + rockXOffset, 100 - rockYOffset, 25 + rockSize);
    }
  }
  _Initialize() {
    this._threejs = new THREE.WebGLRenderer({
      antialias: true,
    });
    this._threejs.outputEncoding = THREE.sRGBEncoding;
    this._threejs.shadowMap.enabled = true;
    this._threejs.shadowMap.type = THREE.PCFSoftShadowMap;
    this._threejs.setPixelRatio(window.devicePixelRatio);
    this._threejs.setSize(window.innerWidth, window.innerHeight);

    document.body.appendChild(this._threejs.domElement);

    window.addEventListener('resize', () => {
      this._OnWindowResize();
    }, false);

    const fov = 60;
    const aspect = window.innerWidth / window.innerHeight;
    const near = 1.0;
    const far = 20000.0;
    this._camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    this._camera.position.set(25, 10, 25);

    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0xccddff);
    this._scene.fog = new THREE.Fog(0xccddff, 500, 2000);

    let light = new THREE.DirectionalLight(0xFFFFFF, 1.0);
    light.position.set(-100, 100, 100);
    light.target.position.set(0, 0, 0);
    light.castShadow = true;
    light.shadow.bias = -0.001;
    light.shadow.mapSize.width = 4096;
    light.shadow.mapSize.height = 4096;
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = 500.0;
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = 500.0;
    light.shadow.camera.left = 50;
    light.shadow.camera.right = -50;
    light.shadow.camera.top = 50;
    light.shadow.camera.bottom = -50;
    this._scene.add(light);

    light = new THREE.AmbientLight(0xFFFFFF, 0.25);
    this._scene.add(light);

    this._objects = [];
    this._collisions = [];
 
    this._CreateLevel1();
    this._score = 0;
    this._scoreText = dcText("Score: " + this._score, 10, 10, 20, 0xff00ff);      // text #2, TRANSPARENT
    this._scoreText.position.set(0,45,50); // move geometry up and out
    this._scene.add(this._scoreText);
    this._mixers = [];
    this._previousRAF = null;

    this._LoadAnimatedModel();
    this._RAF();
  }

  _LoadAnimatedModel() {
    const params = {
      camera: this._camera,
      scene: this._scene, 
      renderer: this._threejs,
      objects: this._objects,
      collisions: this._collisions,
      scoreText: this._scoreText,
      score: this._score,
    }
    this._controls = new BasicCharacterController(params);

    this._thirdPersonCamera = new ThirdPersonCamera({
      camera: this._camera,
      target: this._controls,
    });
  }

  _OnWindowResize() {
    this._camera.aspect = window.innerWidth / window.innerHeight;
    this._camera.updateProjectionMatrix();
    this._threejs.setSize(window.innerWidth, window.innerHeight);
  }

  _RAF() {
    requestAnimationFrame((t) => {
      if (this._previousRAF === null) {
        this._previousRAF = t;
      }

      this._RAF();

      this._threejs.render(this._scene, this._camera);
      this._Step(t - this._previousRAF);
      this._previousRAF = t;
    });
  }

  _Step(timeElapsed) {
    const timeElapsedS = timeElapsed * 0.001;
    if (this._mixers) {
      this._mixers.map(m => m.update(timeElapsedS));
    }

    if (this._controls) {
      this._controls.Update(timeElapsedS);
    }

    this._thirdPersonCamera.Update(timeElapsedS);
  }

  /**
 * Create the floor of the scene.
 */
  _CreateFloor() {
  var geometry = new THREE.PlaneBufferGeometry( 100000, 100000 );
  var material = new THREE.MeshToonMaterial( {color: 0x336633} );
  var plane = new THREE.Mesh( geometry, material );
  plane.rotation.x = -1 * Math.PI/2;
  plane.position.y = 0;
  plane.castShadow = false;
  plane.recieveShadow = true;
  this._scene.add( plane );
  this._objects.push( plane );
}

/**
 * Create a happy little tree.
 */
  _CreateTree( posX, posZ, size = 50 ) {
    var characterSize = size;
    var outlineSize = characterSize * 0.05;
  // Set some random values so our trees look different.
  var randomScale = ( Math.random() * 3 ) + 0.8;
  var randomRotateY = Math.PI/( Math.floor(( Math.random() * 32) + 1 ));
 
  // Create the trunk.
  var geometry = new THREE.CylinderGeometry( characterSize/3.5, characterSize/2.5, characterSize * 1.3, 8 );
  var material = new THREE.MeshToonMaterial( {color: 0x664422} );
  var trunk = new THREE.Mesh( geometry, material );
 
  // Position the trunk based off of it's random given size.
  trunk.position.set(posX, ((characterSize * 1.3 * randomScale)/2) , posZ);
  trunk.scale.x = trunk.scale.y = trunk.scale.z = randomScale;
  this._scene.add( trunk );


  // Create the trunk outline.
  var outline_geo = new THREE.CylinderGeometry( characterSize/3.5 + outlineSize, characterSize/2.5 + outlineSize, characterSize * 1.3 + outlineSize, 8 );
  var outline_mat = new THREE.MeshBasicMaterial({
    color : 0x0000000,
    side: THREE.BackSide
  });
  var outlineTrunk = new THREE.Mesh( outline_geo, outline_mat );
  trunk.add( outlineTrunk );
 
  // Create the tree top.
  var geometry = new THREE.DodecahedronGeometry( characterSize );
  var material = new THREE.MeshToonMaterial({ color: 0x44aa44 });
  var treeTop = new THREE.Mesh( geometry, material );
 
  // Position the tree top based off of it's random given size.
  treeTop.position.set( posX, ((characterSize * 1.3 * randomScale)/2) + characterSize * randomScale, posZ );
  treeTop.scale.x = treeTop.scale.y = treeTop.scale.z = randomScale;
  treeTop.rotation.y = randomRotateY;
  this._scene.add( treeTop );
 
  // Create outline.
  var outline_geo = new THREE.DodecahedronGeometry(characterSize + outlineSize);
  var outline_mat = new THREE.MeshBasicMaterial({
    color : 0x0000000, 
    side: THREE.BackSide
  });
  var outlineTreeTop = new THREE.Mesh(outline_geo, outline_mat);
  treeTop.add( outlineTreeTop );
  if(showBoundingBoxes == true)
  {
    this._scene.add(new THREE.BoxHelper(trunk, 0x0000ff));
  }
  this._calculateCollisionPoints( trunk );
}
 
  /** Create Coin */
_CreateCoin(posX, posZ)
{
    const loader = new FBXLoader();
    loader.setPath('./resources/Coin/');
    loader.load('Coin.fbx', (fbx) => {
      fbx.scale.setScalar(0.05);
      fbx.traverse(c => {
        c.castShadow = true;
      });

      fbx.position.set(posX, 10, posZ)
      this._scene.add(fbx);
      if(showBoundingBoxes == true)
      {
        this._scene.add(new THREE.BoxHelper(fbx, 0xff00ff));
      }
      this._calculateCollisionPoints( fbx, 'reward' ) 
     
    });
      
}
 /**
 * Calculates collision detection parameters.
 */
  _calculateCollisionPoints( mesh, type = 'collision' ) 
  { 
    // Compute the bounding box after scale, translation, etc.
    var bbox = new THREE.Box3().setFromObject(mesh);
   
    var bounds = {
      mesh: mesh,
      type: type,
      xMin: bbox.min.x,
      xMax: bbox.max.x,
      yMin: bbox.min.y,
      yMax: bbox.max.y,
      zMin: bbox.min.z,
      zMax: bbox.max.z,
    };
   
    this._collisions.push( bounds );
  }
  /**
  * Create a happy little rock.
  */
  _CreateRock( posX, posZ, size = 50)
  {
    var characterSize = size;
    var outlineSize = characterSize * 0.05;
    // Set some random values so our trees look different.
    var randomScale = ( Math.random() * 3 ) + 0.8;
    var randomRotateY = Math.PI/( Math.floor(( Math.random() * 32) + 1 ));
    // Create the tree top.
    var geometry = new THREE.DodecahedronGeometry( characterSize );
    var material = new THREE.MeshToonMaterial({ color: 0x606060 });
    var rock = new THREE.Mesh( geometry, material );
    // Position the tree top based off of it's random given size.
    //rock.position.set( posX, ((characterSize * 1.3 * randomScale)/2) + characterSize * randomScale, posZ );
    rock.position.set( posX, 0, posZ );
    rock.scale.x = rock.scale.y = rock.scale.z = randomScale;
    rock.rotation.y = randomRotateY;
    this._scene.add( rock );
 
    // Create outline.
    var outline_geo = new THREE.DodecahedronGeometry(characterSize + outlineSize);
    var outline_mat = new THREE.MeshBasicMaterial({
      color : 0x0000000, 
      side: THREE.BackSide
    });
    var outlineRock = new THREE.Mesh(outline_geo, outline_mat);
    rock.add( outlineRock );
    if(showBoundingBoxes == true)
    {
      this._scene.add(new THREE.BoxHelper(rock, 0xff0000));
    }
    this._calculateCollisionPoints( rock );

  }
}
 /**
  * Add text.
  */
  function dcText(txt, hWorldTxt, hWorldAll, hPxTxt, fgcolor, bgcolor) { // the routine
    // txt is the text.
    // hWorldTxt is world height of text in the plane.
    // hWorldAll is world height of whole rectangle containing the text.
    // hPxTxt is px height of text in the texture canvas; larger gives sharper text.
    // The plane and texture canvas are created wide enough to hold the text.
    // And wider if hWorldAll/hWorldTxt > 1 which indicates padding is desired.
    var kPxToWorld = hWorldTxt/hPxTxt;                // Px to World multplication factor
    // hWorldTxt, hWorldAll, and hPxTxt are given; get hPxAll
    var hPxAll = Math.ceil(hWorldAll/kPxToWorld);     // hPxAll: height of the whole texture canvas
    // create the canvas for the texture
    var txtcanvas = document.createElement("canvas"); // create the canvas for the texture
    var ctx = txtcanvas.getContext("2d");
    ctx.font = hPxTxt + "px sans-serif";        
    // now get the widths
    var wPxTxt = ctx.measureText(txt).width;         // wPxTxt: width of the text in the texture canvas
    var wWorldTxt = wPxTxt*kPxToWorld;               // wWorldTxt: world width of text in the plane
    var wWorldAll = wWorldTxt+(hWorldAll-hWorldTxt); // wWorldAll: world width of the whole plane
    var wPxAll = Math.ceil(wWorldAll/kPxToWorld);    // wPxAll: width of the whole texture canvas
    // next, resize the texture canvas and fill the text
    txtcanvas.width =  wPxAll;
    txtcanvas.height = hPxAll;
    if (bgcolor != undefined) { // fill background if desired (transparent if none)
      ctx.fillStyle = "#" + bgcolor.toString(16).padStart(6, '0');
      ctx.fillRect( 0,0, wPxAll,hPxAll);
    } 

    ctx.textAlign = "center";
    ctx.textBaseline = "middle"; 
    ctx.fillStyle = "#" + fgcolor.toString(16).padStart(6, '0'); // fgcolor
    ctx.font = hPxTxt + "px sans-serif";   // needed after resize
    ctx.fillText(txt, wPxAll/2, hPxAll/2); // the deed is done
    // next, make the texture
    var texture = new THREE.Texture(txtcanvas); // now make texture
    texture.minFilter = THREE.LinearFilter;     // eliminate console message
    texture.needsUpdate = true;                 // duh
    texture.wrapS = THREE.RepeatWrapping;
    texture.repeat.x = -1;
    // and make the world plane with the texture
    var geometry = new THREE.PlaneGeometry(wWorldAll, hWorldAll);
    var material = new THREE.MeshBasicMaterial( 
      { side:THREE.DoubleSide, map:texture, transparent:true, opacity:1.0 } );
    // and finally, the mesh
    var mesh = new THREE.Mesh(geometry, material);
    mesh.wWorldTxt = wWorldTxt; // return the width of the text in the plane
    mesh.wWorldAll = wWorldAll; //    and the width of the whole plane
    mesh.wPxTxt = wPxTxt;       //    and the width of the text in the texture canvas
                                // (the heights of the above items are known)
    mesh.wPxAll = wPxAll;       //    and the width of the whole texture canvas
    mesh.hPxAll = hPxAll;       //    and the height of the whole texture canvas
    mesh.ctx = ctx;             //    and the 2d texture context, for any glitter
    // console.log(wPxTxt, hPxTxt, wPxAll, hPxAll);
    // console.log(wWorldTxt, hWorldTxt, wWorldAll, hWorldAll);
    return mesh;
  }
let _APP = null;

window.addEventListener('DOMContentLoaded', () => {
  _APP = new ThirdPersonCameraDemo();
});


function _LerpOverFrames(frames, t) {
  const s = new THREE.Vector3(0, 0, 0);
  const e = new THREE.Vector3(100, 0, 0);
  const c = s.clone();

  for (let i = 0; i < frames; i++) {
    c.lerp(e, t);
  }
  return c;
}

function _TestLerp(t1, t2) {
  const v1 = _LerpOverFrames(100, t1);
  const v2 = _LerpOverFrames(50, t2);
  console.log(v1.x + ' | ' + v2.x);
}

_TestLerp(0.01, 0.01);
_TestLerp(1.0 / 100.0, 1.0 / 50.0);
_TestLerp(1.0 - Math.pow(0.3, 1.0 / 100.0), 
          1.0 - Math.pow(0.3, 1.0 / 50.0));

