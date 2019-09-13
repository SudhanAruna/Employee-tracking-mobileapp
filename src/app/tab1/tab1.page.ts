import { Component, OnInit } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import {
  ToastController,
  IonSpinner,
  Platform,
  LoadingController,
  PopoverController } from '@ionic/angular';


import {
  GoogleMaps,
  GoogleMap,
  GoogleMapsEvent,
  GoogleMapOptions,
  CameraPosition,
  MarkerOptions,
  GoogleMapsAnimation,
  MyLocation,
  Marker,
  Environment,
  ILatLng,
  BaseArrayClass, 
  LatLng} from '@ionic-native/google-maps';
import { Geolocation } from '@ionic-native/geolocation/ngx';
import { Network } from '@ionic-native/network/ngx';
import { AngularFireAuth } from 'angularfire2/auth';
import { AngularFirestore, AngularFirestoreCollection, AngularFirestoreDocument } from 'angularfire2/firestore';
import { Locate, LocationService } from '../services/location.service';
import { LocationPopoverPage } from '../pages/location-popover/location-popover.page';

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss']
})
export class Tab1Page implements OnInit {

  date: Date = new Date();
  map: GoogleMap;
  loading: any;
  locateDatas: Locate[];
  dubList = [];
  points = [];
  noDataRecord = false;
  isTracking: Boolean = false;
  user = null;
  userID: any = 'none';
  positionCollection: AngularFirestoreCollection<any>;
  userCollection: AngularFirestoreCollection<any>;
  currentPositionCollection: AngularFirestoreCollection<any>;
  locationSubscription: Subscription;
  trashLocationSub: Subscription;
  networkSubscription: Subscription;
  locationLat = null;
  locationLng: any = 0;
  locationTimeStamp = null;
  trashPositionArray = [];

  constructor(
    private network: Network,
    private popoverCtrl: PopoverController,
    private locateService: LocationService,
    public loadingCtrl: LoadingController,
    public toastCtrl: ToastController,
    private platform: Platform,
    private googleMaps: GoogleMaps,
    private geolocation: Geolocation,
    private fireAuth: AngularFireAuth,
    private fireStore: AngularFirestore
  ) {

  }

  async anomLogin() {
    await this.fireAuth.auth.signInAnonymously().then( user => {
      this.user = user.user;
      this.userID = user.user.uid;
      
      this.positionCollection = this.fireStore.collection(
        `driverPostions/${this.userID}/track`,
        ref => ref.orderBy('timestamp')
      );
      
      this.userCollection = this.fireStore.collection(`users`);
      
      this.userCollection.doc(`${this.userID}`).update({
        userID: this.userID,
        status: 'offline',
        st : true
      });

      this.currentPositionCollection = this.fireStore.collection(
          `driverPostions/${this.userID}/current`,
          ref => ref.orderBy('timestamp')
      );  
      
      this.fireStore.collection(`driverPostions/${this.userID}/current`).doc('currentLocate')
      .set({
        lng: 0,
        lat: 0,
        timestamp: 0,
        driverID: this.userID,
        status: 'offline'
      });
    }).catch((err) => {
      alert('Unable to sign in & userCollection set : ' + err.message);
      // window.close();
    });

  }

  ionViewWillUnload() {
    this.updateStatus(false);
  }

  ionViewDidLeave() {
    // window.location.reload();
    // this.trashLocationSub.unsubscribe();
    // this.updateStatus(false);
  }

  mapCnLat: any;

   async loadTrashIntoPoints() {
    this.trashLocationSub = await this.locateService.getLocates().subscribe( rslt => {
      if (rslt.length <= 0 ) {
        this.noDataRecord = true;
        // if (this.isTracking) {
        //   this.stopTracking();
        // }
      }
      // else { this.map.clear(); }
      for (const locate of rslt) {
        const latValue = locate.glatitude;
        const lngValue = locate.glongitude;
        const descValue = locate.description;
        const imgs = locate.imgsrc;
        const locatId = locate.id;
        let num = 0;
        this.points.push(
          {
              position: {lat: latValue, lng: lngValue},
              // title: locatId,
              title: {image: imgs, id: locatId } ,
              ImgValue: imgs,
              iconData: 'blue',
              IdValue: locatId,
              MarkValue: num++
          }
        );
      }
      this.platform.ready();
      this.loadMap();
      this.mapCnLat = this.map.getCameraPosition().target;
      this.loading.dismiss();
    });
  }

  async chkCleanValidation() {
    
  }

  todayRefDate: string;
  async ngOnInit() {

    this.todayRefDate = 'Date:' + this.date.getDate() + '-' + this.date.getMonth(); 

    this.loading = await this.loadingCtrl.create({
      message: 'Loading..',
      spinner: 'lines'
    });
    await this.anomLogin();
    await this.platform.ready();
    await this.loadTrashIntoPoints();
    // await this.testLoadMap();
    
  }

  addLocation( lat, lng, timestamp) {
    this.positionCollection.add({
      lat,
      lng,
      timestamp
    });
  }

  updateCurrentPosition(latLocation, lngLocation, timestampLocation) {
    this.currentPositionCollection.doc('currentLocate').update({
      lat: latLocation,
      lng: lngLocation,
      timestamp: timestampLocation
    });
  }

  updateStatus( status:Boolean ) {
    let stat: string;
    if (status){
      stat = 'online';
    } else {
      stat = 'offline';
    }
    this.currentPositionCollection.doc('currentLocate').update({
      driverID: this.userID,
      status: stat
    });
    this.userCollection.doc(this.userID).update({
      status: stat,
      st: status
    });
  }

  markerArray = []
  markerArrayStatus: String = 'None';
  mark: Marker = null;
  async startTracking() {
    this.isTracking = true;
    this.updateStatus(true);
    this.locationSubscription = this.geolocation.watchPosition({
      enableHighAccuracy: true,
      maximumAge: 10000
    }).subscribe( (data) => {
      if (this.locationLng != data.coords.longitude || this.locationLat != data.coords.latitude ) {
        if (this.markerArray.length >= 1 ) {
          // this.map.clear();
          // this.markerArrayStatus = 'Greater than One >>> Positive : ' + this.markerArray.length;
          const prevMarker: Marker = this.markerArray.pop();
          prevMarker.remove();
        } else {
          // this.markerArrayStatus = 'Less than One >>> Negative : ' + this.markerArray.length;
        }

        this.locationLat = data.coords.latitude;
        this.locationLng = data.coords.longitude;
        this.locationTimeStamp = data.timestamp;
        this.updateCurrentPosition(this.locationLat, this.locationLng, this.locationTimeStamp);
        // this.addLocation(this.locationLat, this.locationLng, this.locationTimeStamp);
        this.mark = this.map.addMarkerSync({
          position : {
          lat: this.locationLat,
          lng: this.locationLng
          },
          icon: {
          url: 'assets/icon/iconfinder-48.png',
          size: {
            width: 32,
            height: 32
            }
          }
        });
        this.markerArray.push(this.mark);
      }
    });

    // debug 

  }




  async stopTracking() {
    // this.trashLocationSub.unsubscribe();
    this.mark.remove();
    this.isTracking = false;
    await this.updateStatus(false);
    await this.locationSubscription.unsubscribe();
  }



  // async testloadTrash() {
  //   this.locateTrash = true;
  //   this.trashLocationSub = await this.locateService.getLocates().subscribe( rslt => {
  //     if (rslt.length <= 0 ) { this.noDataRecord = true; }
  //     // else { this.map.clear(); }
  //     for (const locate of rslt) {
  //       const latValue = locate.glatitude;
  //       const lngValue = locate.glongitude;
  //       const descValue = locate.description;
  //       const imgs = locate.imgsrc;
  //       const locatId = locate.id;
  //       let num = 0;
  //       this.points.push(
  //         {
  //             position: {lat: latValue, lng: lngValue},
  //             // title: locatId,
  //             title: {image: imgs, id: locatId } ,
  //             ImgValue: imgs,
  //             iconData: 'blue',
  //             IdValue: locatId,
  //             MarkValue: num++
  //         }
  //       );
  //     }

  //     const POINTS: BaseArrayClass<any> = new BaseArrayClass<any>(this.points);

  //     const bounds: ILatLng[] = POINTS.map((data: any, idx: number) => {
  //       console.log(data);
  //       return data.position;
  //     });

  //     // this.map = GoogleMaps.create('map_canvas', {
  //     //   camera: {
  //     //     target: bounds,
  //     //     zoom: 10
  //     //   }
  //     // });

  //     // this.loading.dismiss();

  //     POINTS.forEach((data: any) => {
  //       data.disableAutoPan = true;
  //       const marker: Marker = this.map.addMarkerSync(data);
  //       this.trashPositionArray.push(marker);
  //       try {
  //         marker.on(GoogleMapsEvent.MARKER_CLICK).subscribe( () => {
  //           this.loading.present();
  //           const lImg = marker.get('ImgValue');
  //           const lId = marker.get('IdValue');
  //           const lNum = marker.get('MarkValue');
  //           this.popOverTest(lImg, lId, lNum);
  //         });
  //       } catch (error) {
  //         alert('Error : ' + error.message);
  //       }

  //     });
  //   });
  // }

  loadMap() {
    
    const POINTS: BaseArrayClass<any> = new BaseArrayClass<any>(this.points);

    const bounds: ILatLng[] = POINTS.map((data: any, idx: number) => {
      console.log(data);
      return data.position;
    });

    this.map = GoogleMaps.create('map_canvas', {
      camera: {
        target: bounds,
        zoom: 10
      }
    });

    this.map.setTrafficEnabled(true);

    this.loading.dismiss();

    POINTS.forEach((data: any) => {
      data.disableAutoPan = true;
      const marker: Marker = this.map.addMarkerSync(data);
      try {
        marker.on(GoogleMapsEvent.MARKER_CLICK).subscribe( () => {
          this.loading.present();
          const lImg = marker.get('ImgValue');
          const lId = marker.get('IdValue');
          const lNum = marker.get('MarkValue');
          const pos = marker.getPosition();
          this.popOverTest(lImg, lId, lNum, this.userID, pos.lat, pos.lng );
        });
      } catch (error) {
        alert('Error : ' + error.message);
      }
    });

  }

   getDistance(lat1, lng1, lat2, lng2 ) {
    let R = 6371000; // Calculated in meters
    let dLat = this.degToRad( lat2 - lat1 );
    let dLng = this.degToRad( lng2 - lng1 );
    let a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + 
    Math.cos(this.degToRad(lat1)) * Math.cos(this.degToRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
    let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt( 1 - a));
    let d = R * c;
    return d;
  }

  degToRad( deg ) {
    return deg * ( Math.PI / 180 );
  }

  async popOverTest( img: string, id: string, num, user, poslat, poslng ) {
    if (this.isTracking){
      let dist: number = this.getDistance(this.locationLat, this.locationLng, poslat, poslng );
      if( dist <= 50 ){
        alert("Distance is : " + dist);
        this.loading.present();
        const popover = await this.popoverCtrl.create({
        component: LocationPopoverPage,
        componentProps: {
          location_img: img,
          location_id : id,
          locationMark_num: num,
          userId: user
          }
        });
        this.loading.dismiss();
        popover.present();
      } else {
        alert("Warning : Required Distance 50 meters or less ");
      }

    } else {
      alert("Please Enable Tracking");
    }
    
  }

  doRefresh( event ) {
    setTimeout( () => {
      window.location.reload();
      event.target.complete();
    }, 1000);
  }

}
