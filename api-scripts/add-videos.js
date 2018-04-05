const axios = require('axios')
const Queue = require('../helpers/queue')
const { youtube } = require('../constants')
const moment = require('moment')

const channelIDs = new Queue()
const uploadIDs = new Queue()
const videoIDs = new Queue()

const videosInterval = () => setTimeout(() => {
  const currentVideosID = videoIDs.dequeue()
  axios.get('https://www.googleapis.com/youtube/v3/videos', {
    params: {
      id: currentVideosID,
      part: 'snippet,contentDetails,statistics',
      key: youtube.apiKey,
    },
  }).then(response => {
      const videos = response.data.items[0]
      const time = moment.duration(videos.contentDetails.duration)
      const duration = moment(time._milliseconds).format('mm:ss')
      const resolutions = Object.keys(videos.snippet.thumbnails)
      const videoThumbnail = videos.snippet.thumbnails[resolutions[resolutions.length - 1]].url
      axios.get(`http://localhost:3001/channels?channelId=${videos.snippet.channelId}`)
        .then(channelId => {
          axios.post('http://localhost:3001/videos', {
            videoId: videos.id,
            channelTitle: videos.snippet.channelTitle,
            channelId: channelId.data[0].id,
            title: videos.snippet.title,
            description: videos.snippet.description,
            publishedAt: videos.snippet.publishedAt,
            videoThumbnail,
            duration,
            viewCount: videos.statistics.viewCount,
            likeCount: videos.statistics.likeCount,
            dislikeCount: videos.statistics.dislikeCount,
            favoriteCount: videos.statistics.favoriteCount,
            commentCount: videos.statistics.commentCount,
          }).then(() => {
            if (videoIDs.count - videoIDs.lowestCount > 0) {
              videosInterval()
            } else if (videoIDs.count - videoIDs.lowestCount === 0) {
              console.log('done:', videoIDs)
            }
          })
        }).catch(err => err)
  }).catch(() => console.log('nothing to add'))
}, 200)

const uploadsInterval = () => {
  const currentUploadID = uploadIDs.dequeue()
  console.log('currentUploadID:', currentUploadID)
  const pageInterval = (currentUploadID, nextPageToken) => setTimeout(() => {
    axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
      params: {
        part: 'snippet,contentDetails',
        maxResults: 50,
        playlistId: currentUploadID,
        pageToken: nextPageToken,
        key: youtube.apiKey,
      },
    }).then(response => {
      const lastId = response.data.items[response.data.items.length - 1].contentDetails.videoId
      axios.get(`http://localhost:3001/videos?videoId=${lastId}`)
        .then(local => {
          if (local.data.length) {
            uploadsInterval()
          } else {
            response.data.items.forEach(video => {
              const id = video.contentDetails.videoId
              videoIDs.enqueue(id)
            })
          }
          if (response.data.nextPageToken) {
            pageInterval(currentUploadID, response.data.nextPageToken)
          } else if (uploadIDs.count - uploadIDs.lowestCount > 0) {
            uploadsInterval()
          } else if (uploadIDs.count - uploadIDs.lowestCount === 0) {
            videosInterval()
          }
        })
    }).catch(() => videosInterval())
  }, 200)
  pageInterval(currentUploadID)
}

const channelInterval = () => {
  const channelId = channelIDs.dequeue()
  axios.get('https://www.googleapis.com/youtube/v3/channels', {
    params: {
      part: 'snippet,contentDetails,statistics',
      id: channelId,
      key: youtube.apiKey,
    },
  }).then(response => {
    const id = response.data.items[0].contentDetails.relatedPlaylists.uploads
    const channelId = response.data.items[0].id

    axios.get(`http://localhost:3001/channels?channelId=${channelId}`)
      .then(local => {
        if (!local.data.length) {
          axios.post('http://localhost:3001/channels', {
            channelId: response.data.items[0].id,
            title: response.data.items[0].snippet.title,
            description: response.data.items[0].snippet.description,
            customUrl: response.data.items[0].snippet.customUrl,
            publishedAt: response.data.items[0].snippet.publishedAt,
            thumbnail: response.data.items[0].snippet.thumbnails.medium.url,
            uploads: response.data.items[0].contentDetails.relatedPlaylists.uploads,
            viewCount: response.data.items[0].statistics.viewCount,
            commentCount: response.data.items[0].statistics.commentCount,
            subscriberCount: response.data.items[0].statistics.subscriberCount,
            videoCount: response.data.items[0].statistics.videoCount
          })
        }
        uploadIDs.enqueue(id)
        if (channelIDs.count - channelIDs.lowestCount > 0) {
          channelInterval()
        } else if (channelIDs.count - channelIDs.lowestCount === 0) {
          uploadsInterval()
        }
      })
  })
}

const createChannelIdQueue = () => {
  youtube.channelIds.map(id => channelIDs.enqueue(id))
  channelInterval()
}

createChannelIdQueue()
