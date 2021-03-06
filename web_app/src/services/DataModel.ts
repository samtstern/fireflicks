// Copyright 2018 Google LLC

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//     https://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Typings for modules imported dynamically
import FirebaseAppModule = require("firebase/app");
import FirebaseSingleton from "./FirebaseSingleton";
import FirestoreModule from "@firebase/firestore-types";

type Movie = {
  title: string;
  averageRating: number;
  overview: string;
  poster: string;
  genres: { string: boolean };
  genreList: string;
  key: string;
};
type Review = {
  review_text: string;
  rating: number;
};

export default class DataModel {
  fst: FirebaseSingleton;
  type: string;
  isAnon = true;
  async init() {
    this.fst = await FirebaseSingleton.GetInstance();
  }

  async loadMovies(
    loadMore: boolean,
    collection: string,
    lastMovie: FirestoreModule.DocumentSnapshot,
    filter: string,
    more_movies_found: boolean,
    movies: Movie[],
    reviews: Review[],
    type: string
  ) {
    this.type = type;
    let query: FirestoreModule.Query;
    // start with the last movie, or remove all movies
    if (loadMore && lastMovie) {
      query = this.fst.firestore
        .collection(collection)
        .startAfter(lastMovie)
        .limit(10);
    } else {
      // clear out the current movies
      movies = [];
      reviews = [];
      query = this.fst.firestore.collection(collection).limit(10);
    }
    const result = this.apply_query_filter(query, filter);
    query = result.query;
    return await this.update_movies(
      query,
      lastMovie,
      more_movies_found,
      movies,
      reviews
    );
  }

  apply_query_filter(query: FirestoreModule.Query, filter: string) {
    if (filter !== "" && filter !== null && filter !== undefined) {
      console.log(`${filter} is selected`);
      query = query.where(`genres.${filter}`, "==", true);
      return { query };
    }
    return { query };
  }

  async update_movies(
    query: FirestoreModule.Query,
    lastMovie: FirestoreModule.DocumentSnapshot,
    more_movies_found: boolean,
    movies: Movie[],
    reviews: Review[]
  ) {
    const snapshot = await query.get();
    // if there are no docs, show error message
    if (snapshot.docs.length === 0) {
      more_movies_found = false;
      return {
        lastMovie,
        more_movies_found,
        movies,
        reviews
      };
    }
    more_movies_found = true;
    lastMovie = snapshot.docs[snapshot.docs.length - 1];
    snapshot.docs.forEach(async snap => {
      if (this.type === "app") {
        let movie = snap.data() as Movie;
        movie.key = snap.id;
        movie = this.configureData(movie);
        movies.push(movie as Movie);
      } else if (this.type === "mymovies" || this.type === "myreviews") {
        const key = snap.id;
        const movie = await this.getMovie(key);
        movies.push(movie as Movie);
      }
      if (this.type === "myreviews") {
        let review = snap.data() as Review;
        reviews.push(review);
      }
    });
    return {
      lastMovie,
      more_movies_found,
      movies,
      reviews
    };
  }

  async getMovie(key: string) {
    const movieRef = this.fst.firestore.collection("movies").doc(key);
    const snap = await movieRef.get();
    let movie = snap.data() as Movie;
    movie.key = snap.id;
    movie = this.configureData(movie);
    return movie;
  }

  configureData(movie: Movie) {
    movie.averageRating = Math.round(movie.averageRating * 10) / 10;
    // if there is no movie poster, use default.
    // if there is no http, add prefix from tmdb.
    // otherwise, image is from another source
    if (movie.poster === null) {
      movie.poster = "src/assets/Popcorn_Sparky.png";
    } else if (
      !movie.poster.startsWith("https://image.tmdb.org/t/p/w500") &&
      !movie.poster.startsWith("https:")
    ) {
      movie.poster = "https://image.tmdb.org/t/p/w500" + movie.poster;
      console.log(`updating movie poster${movie.poster}`);
    } else {
      console.log("movie post");
      console.log(movie.poster);
    }
    if (movie.overview === null) {
      movie.overview = " ";
    }
    for (let genre in movie.genres) {
      if (movie.genreList) {
        movie.genreList = `${movie.genreList}, ${genre}`;
      } else {
        movie.genreList = genre;
      }
    }
    return movie;
  }

  // Auth Related Funtions

  async checkLoginStatus() {
    this.fst = await FirebaseSingleton.GetInstance();
    if (this.fst.auth.currentUser.email) {
      this.isAnon = false;
    }
    return this.isAnon;
  }

  async updateAnonStatus() {
    let isMod = false;
    this.isAnon = !this.isAnon;
    // if user is signed in, check if moderator
    if (!this.isAnon) {
      isMod = await this.checkIsMod();
    }
    return isMod;
  }

  // return true current user has the moderator claim
  async checkIsMod() {
    let isMod = false;
    this.fst = await FirebaseSingleton.GetInstance();
    const token = await this.fst.auth.currentUser.getIdToken();
    // Parse the ID token.
    const payload = JSON.parse(atob(token.split(".")[1]));
    // Confirm the user is a Moderator.
    if (payload["moderator"]) {
      isMod = true;
    }
    return isMod;
  }
}
