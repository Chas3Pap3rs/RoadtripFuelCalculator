// Fetch coordinates using Google Geocoding API
function getCoordinates(address) {
    const apiKey = 'YOUR_API_KEY_HERE'; // Replace with your actual API key
    return fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'OK' && data.results.length > 0) {
                const { lat, lng } = data.results[0].geometry.location;

                // Find city and state from address components
                const components = data.results[0].address_components;
                const city = components.find(component => component.types.includes('locality'))?.long_name || 
                             components.find(component => component.types.includes('administrative_area_level_2'))?.long_name;
                const state = components.find(component => component.types.includes('administrative_area_level_1'))?.long_name;

                return { lat, lon: lng, city, state };
            } else {
                throw new Error("No results found for the address");
            }
        });
}

function getCityFromCoordinates(lat, lng) {
    const apiKey = 'YOUR_API_KEY_HERE'; // Replace with your API key
    return fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'OK' && data.results.length > 0) {
                const components = data.results[0].address_components;
                const city = components.find(component => component.types.includes('locality'))?.long_name || 
                             components.find(component => component.types.includes('administrative_area_level_2'))?.long_name;
                return city;
            } else {
                throw new Error("No results found for the coordinates");
            }
        });
}

// Fetch gas prices for a city using CollectAPI
function getGasPrice(city) {
    return fetch(`https://api.collectapi.com/gasPrice/fromCity?city=${encodeURIComponent(city)}&type=gasoline`, {
        headers: {
            'Authorization': 'YOUR_API_KEY_HERE', // Replace with your actual API key
            'content-type': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`CollectAPI Error: ${response.status} ${response.statusText}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success && data.result.gasoline && data.result.unit === "liter") {
            // Convert price from liters to gallons
            const pricePerLiter = parseFloat(data.result.gasoline);
            const pricePerGallon = (pricePerLiter * 3.78541).toFixed(2);
            return pricePerGallon;
        } else {
            console.warn("Gas price data not available for the selected city or unexpected unit. Using default price.");
            return 3.50; // Default gas price in case data is not available
        }
    })
    .catch(error => {
        console.error("Error fetching gas prices:", error);
        return 3.50; // Default gas price in case of an error
    });
}

// Initialize the Google Maps API
function initMap() {
    // Map initialization can go here if needed
}

// Get route distance and waypoints for refueling using Google Maps JavaScript API
function getRouteDistanceAndStops(startLatLon, endLatLon, mpg, tankSize) {
    return new Promise((resolve, reject) => {
        const directionsService = new google.maps.DirectionsService();

        const request = {
            origin: startLatLon,
            destination: endLatLon,
            travelMode: 'DRIVING'
        };

        directionsService.route(request, function(result, status) {
            if (status === 'OK') {
                const route = result.routes[0];
                const distanceMeters = route.legs[0].distance.value;
                const totalDistanceMiles = (distanceMeters / 1609.34).toFixed(2); // Convert to miles
                const distancePerTank = mpg * tankSize;
                const numStops = Math.ceil(totalDistanceMiles / distancePerTank); // Number of refuel stops needed
                const refuelStops = [];

                // Calculate refuel points along the route
                for (let i = 1; i <= numStops; i++) {
                    const distanceToStopMeters = (i * distancePerTank * 1609.34); // Convert miles to meters
                    let legIndex = 0;
                    let accumulatedDistance = 0;

                    // Find the leg along the route where the stop would be
                    while (accumulatedDistance + route.legs[legIndex].distance.value < distanceToStopMeters) {
                        accumulatedDistance += route.legs[legIndex].distance.value;
                        legIndex++;
                    }

                    // Interpolate the stop within the leg
                    const remainingDistance = distanceToStopMeters - accumulatedDistance;
                    const stepIndex = route.legs[legIndex].steps.findIndex(step => step.distance.value >= remainingDistance);

                    if (stepIndex !== -1) {
                        const stopLocation = route.legs[legIndex].steps[stepIndex].end_location;
                        refuelStops.push(stopLocation);
                    }
                }

                resolve({ totalDistanceMiles, refuelStops });
            } else {
                reject("Directions request failed due to " + status);
            }
        });
    });
}

document.getElementById("trip-form").addEventListener("submit", function(e) {
    e.preventDefault();

    // Hide the results container initially before processing
    document.getElementById("results").style.display = "none";

    const start = document.getElementById("start").value;
    const destination = document.getElementById("destination").value;
    const mpg = parseFloat(document.getElementById("mpg").value);
    const tankSize = parseFloat(document.getElementById("tank-size").value);
    const roundTrip = document.getElementById("round-trip").checked;

    if (!start || !destination || !mpg || !tankSize) {
        alert("Please fill in all fields.");
        return;
    }

    // Get coordinates for the start and destination locations
    Promise.all([getCoordinates(start), getCoordinates(destination)])
    .then(([startCoords, endCoords]) => {
        console.log("Coordinates fetched:", { startCoords, endCoords });

        const startLatLon = new google.maps.LatLng(startCoords.lat, startCoords.lon);
        const endLatLon = new google.maps.LatLng(endCoords.lat, endCoords.lon);

        // Call the function to get route distance and refuel stops
        return getRouteDistanceAndStops(startLatLon, endLatLon, mpg, tankSize)
            .then(({ totalDistanceMiles, refuelStops }) => {
                console.log("Route distance and refuel stops calculated:", { totalDistanceMiles, refuelStops });

                const stops = refuelStops.length;
                return { totalDistanceMiles, stops, refuelStops, startCoords, endCoords };
            });
    })
    .then(({ totalDistanceMiles, stops, refuelStops, startCoords }) => {
        console.log("Fetching gas prices for refuel stops:", refuelStops);

        // Get gas prices for each refuel stop
        return Promise.all(refuelStops.map(stop => 
            getCityFromCoordinates(stop.lat(), stop.lng())
                .then(city => {
                    console.log("City for stop found:", city);
                    return getGasPrice(city);
                })
        )).then(gasPrices => {
            console.log("Gas prices fetched for all stops:", gasPrices);

            const avgGasPrice = gasPrices.reduce((sum, price) => sum + parseFloat(price), 0) / gasPrices.length;
            const totalFuel = (totalDistanceMiles / mpg).toFixed(2);
            const totalCost = (totalFuel * avgGasPrice).toFixed(2);

            console.log("Average gas price and total cost calculated:", { avgGasPrice, totalFuel, totalCost });

            return { totalDistanceMiles, stops, avgGasPrice, totalFuel, totalCost };
        });
    })
    .then(({ totalDistanceMiles, stops, avgGasPrice, totalFuel, totalCost }) => {
        console.log("Displaying final results:", { totalDistanceMiles, stops, avgGasPrice, totalFuel, totalCost });

        // Show the results container
        document.getElementById("results").style.display = "block";

        // Display results
        document.getElementById("results").innerHTML = `
            <p>Total Distance: ${totalDistanceMiles} miles</p>
            <p>Fuel Stops Needed: ${stops}</p>
            <p>Total Fuel Needed: ${totalFuel} gallons</p>
            <p>Average Gas Price: $${avgGasPrice} per gallon</p>
            <p>Total Estimated Cost: $${totalCost}</p>
        `;
    })
    .catch(error => {
        console.error("Error encountered during calculation:", error);

        document.getElementById("results").style.display = "block"; // Show results container for error message
        document.getElementById("results").innerHTML = `<p style="color: red;">Error calculating route or fetching gas prices. Please check your inputs and try again.</p>`;
    });
});
