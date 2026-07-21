package main

import (
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

func main() {
	// Initialize Gin router
	router := gin.Default()

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status": "up",
			"service": "api-gateway",
		})
	})

	// APISIX Sync Endpoint
	router.POST("/sync/apisix", func(c *gin.Context) {
		// Mock APISIX route sync logic
		c.JSON(http.StatusOK, gin.H{
			"status": "synced",
			"routes": 42,
		})
	})

	// Keycloak Sync Endpoint
	router.POST("/sync/keycloak", func(c *gin.Context) {
		// Mock Keycloak realm sync logic
		c.JSON(http.StatusOK, gin.H{
			"status": "synced",
			"roles": 12,
		})
	})

	// Get port from env or default to 8080
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Starting API Gateway on port %s", port)
	router.Run(":" + port)
}
